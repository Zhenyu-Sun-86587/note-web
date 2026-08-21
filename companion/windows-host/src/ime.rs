use std::thread;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};

use crate::protocol::{NativeResponse, SwitchStrategy};
use crate::window::{get_foreground_target_window, validate_target_window, TargetWindowInfo};

#[cfg(windows)]
use windows::{
    core::w,
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        UI::{
            Input::{
                Ime::ImmGetDefaultIMEWnd,
                KeyboardAndMouse::{
                    GetKeyboardLayout, LoadKeyboardLayoutW, ACTIVATE_KEYBOARD_LAYOUT_FLAGS,
                    KLF_NOTELLSHELL, KLF_SUBSTITUTE_OK,
                },
            },
            WindowsAndMessaging::{PostMessageW, SendMessageW},
        },
    },
};

const WM_INPUTLANGCHANGEREQUEST: u32 = 0x0050;
const WM_IME_CONTROL: u32 = 0x0283;
const IMC_GETOPENSTATUS: usize = 0x0005;
const IMC_SETOPENSTATUS: usize = 0x0006;

#[derive(Debug, Clone)]
pub struct SavedTargetState {
    pub hwnd: usize,
    pub pid: u32,
    pub tid: u32,
    pub previous_ime_open: Option<bool>,
    pub previous_hkl: Option<usize>,
}

#[derive(Debug, Default)]
pub struct SessionState {
    pub switched: bool,
    pub target: Option<SavedTargetState>,
    pub strategy: Option<SwitchStrategy>,
}

#[derive(Debug)]
pub struct DoctorReport {
    pub foreground_hwnd: usize,
    pub pid: u32,
    pub tid: u32,
    pub process_name: String,
    pub exe_path: String,
    pub current_hkl: usize,
    pub lang_id: u16,
    pub default_ime_hwnd: usize,
    pub ime_open_status: Option<bool>,
    pub candidate_strategy: String,
    pub is_supported_browser: bool,
}

impl SessionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn handle_ping(&self, id: &str) -> NativeResponse {
        NativeResponse::success(id, "ping")
    }

    #[cfg(windows)]
    pub fn handle_get_state(&self, id: &str) -> NativeResponse {
        let mut resp = NativeResponse::success(id, "get_state");
        match get_foreground_target_window() {
            Ok(target) => {
                resp.target_pid = Some(target.pid);
                resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                let hkl = unsafe { GetKeyboardLayout(target.tid).0 as usize };
                let is_ascii = (hkl & 0xFFFF) == 0x0409;
                resp.verified = Some(is_ascii);
                resp.strategy = self.strategy.clone();
            }
            Err(e) => {
                resp.ok = false;
                resp.code = Some("TARGET_QUERY_FAILED".to_string());
                resp.message = Some(e.to_string());
            }
        }
        resp
    }

    #[cfg(not(windows))]
    pub fn handle_get_state(&self, id: &str) -> NativeResponse {
        NativeResponse::error(id, "get_state", "UNSUPPORTED_PLATFORM", "Non-Windows OS")
    }

    #[cfg(windows)]
    pub fn switch_ascii(&mut self, id: &str) -> NativeResponse {
        let start_time = Instant::now();
        let target = match get_foreground_target_window() {
            Ok(t) => t,
            Err(e) => {
                return NativeResponse::error(
                    id,
                    "switch_ascii",
                    "TARGET_NOT_BROWSER",
                    &e.to_string(),
                );
            }
        };

        // Idempotency: if already switched for the exact same target window
        if self.switched {
            if let Some(ref saved) = self.target {
                if saved.hwnd == target.hwnd && saved.pid == target.pid {
                    let mut resp = NativeResponse::success(id, "switch_ascii");
                    resp.strategy = self.strategy.clone();
                    resp.verified = Some(true);
                    resp.target_pid = Some(target.pid);
                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                    return resp;
                }
            }
        }

        // Try Strategy A: IME Open/Close State
        match try_strategy_a_switch(&target) {
            Ok(Some(prev_open)) => {
                self.switched = true;
                self.strategy = Some(SwitchStrategy::ImeOpenState);
                self.target = Some(SavedTargetState {
                    hwnd: target.hwnd,
                    pid: target.pid,
                    tid: target.tid,
                    previous_ime_open: Some(prev_open),
                    previous_hkl: None,
                });

                let mut resp = NativeResponse::success(id, "switch_ascii");
                resp.strategy = Some(SwitchStrategy::ImeOpenState);
                resp.verified = Some(true);
                resp.target_pid = Some(target.pid);
                resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                return resp;
            }
            Ok(None) | Err(_) => {
                // Strategy A unsupported or failed -> Fallback to Strategy B
            }
        }

        // Try Strategy B: Targeted Keyboard Layout HKL switch to 0x0409 (US English)
        match try_strategy_b_switch(&target) {
            Ok((prev_hkl, verified)) => {
                self.switched = true;
                self.strategy = Some(SwitchStrategy::KeyboardLayout);
                self.target = Some(SavedTargetState {
                    hwnd: target.hwnd,
                    pid: target.pid,
                    tid: target.tid,
                    previous_ime_open: None,
                    previous_hkl: Some(prev_hkl),
                });

                let mut resp = NativeResponse::success(id, "switch_ascii");
                resp.strategy = Some(SwitchStrategy::KeyboardLayout);
                resp.verified = Some(verified);
                resp.target_pid = Some(target.pid);
                resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                resp
            }
            Err(e) => NativeResponse::error(
                id,
                "switch_ascii",
                "SWITCH_FAILED",
                &format!("Strategy B failed: {}", e),
            ),
        }
    }

    #[cfg(not(windows))]
    pub fn switch_ascii(&mut self, id: &str) -> NativeResponse {
        NativeResponse::error(id, "switch_ascii", "UNSUPPORTED_PLATFORM", "Non-Windows OS")
    }

    #[cfg(windows)]
    pub fn restore(&mut self, id: &str) -> NativeResponse {
        let start_time = Instant::now();
        if !self.switched {
            let mut resp = NativeResponse::success(id, "restore");
            resp.restored = Some(false);
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            return resp;
        }

        let saved = match self.target.take() {
            Some(s) => s,
            None => {
                self.switched = false;
                self.strategy = None;
                let mut resp = NativeResponse::success(id, "restore");
                resp.restored = Some(false);
                return resp;
            }
        };

        let strategy = self.strategy.take();
        self.switched = false;

        // Validate target window is still alive and has the same PID
        if !validate_target_window(saved.hwnd, saved.pid) {
            let mut resp = NativeResponse::success(id, "restore");
            resp.restored = Some(false);
            resp.message = Some("Target window was closed; state cleared".to_string());
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            return resp;
        }

        let hwnd = HWND(saved.hwnd as *mut std::ffi::c_void);

        match strategy {
            Some(SwitchStrategy::ImeOpenState) => {
                if let Some(prev_open) = saved.previous_ime_open {
                    unsafe {
                        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);
                        if !ime_wnd.0.is_null() {
                            SendMessageW(
                                ime_wnd,
                                WM_IME_CONTROL,
                                WPARAM(IMC_SETOPENSTATUS),
                                LPARAM(if prev_open { 1 } else { 0 }),
                            );
                        }
                    }
                }
            }
            Some(SwitchStrategy::KeyboardLayout) => {
                if let Some(prev_hkl_raw) = saved.previous_hkl {
                    unsafe {
                        let _ = PostMessageW(
                            hwnd,
                            WM_INPUTLANGCHANGEREQUEST,
                            WPARAM(0),
                            LPARAM(prev_hkl_raw as isize),
                        );

                        // Short poll verification
                        let deadline = Instant::now() + Duration::from_millis(250);
                        while Instant::now() < deadline {
                            let current = GetKeyboardLayout(saved.tid).0 as usize;
                            if current == prev_hkl_raw
                                || (current & 0xFFFF) == (prev_hkl_raw & 0xFFFF)
                            {
                                break;
                            }
                            thread::sleep(Duration::from_millis(15));
                        }
                    }
                }
            }
            None => {}
        }

        let mut resp = NativeResponse::success(id, "restore");
        resp.restored = Some(true);
        resp.target_pid = Some(saved.pid);
        resp.target_hwnd = Some(format!("0x{:X}", saved.hwnd));
        resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
        resp
    }

    #[cfg(not(windows))]
    pub fn restore(&mut self, id: &str) -> NativeResponse {
        NativeResponse::error(id, "restore", "UNSUPPORTED_PLATFORM", "Non-Windows OS")
    }
}

#[cfg(windows)]
pub fn run_doctor() -> Result<DoctorReport> {
    let target = get_foreground_target_window()?;
    let hwnd = HWND(target.hwnd as *mut std::ffi::c_void);

    unsafe {
        let hkl = GetKeyboardLayout(target.tid).0 as usize;
        let lang_id = (hkl & 0xFFFF) as u16;
        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);

        let ime_open_status = if !ime_wnd.0.is_null() {
            let res: LRESULT = SendMessageW(
                ime_wnd,
                WM_IME_CONTROL,
                WPARAM(IMC_GETOPENSTATUS),
                LPARAM(0),
            );
            Some(res.0 != 0)
        } else {
            None
        };

        let candidate_strategy = if ime_open_status.is_some() {
            "Strategy A (IME Open State) / Strategy B (Keyboard Layout)".to_string()
        } else {
            "Strategy B (Keyboard Layout 0x0409)".to_string()
        };

        Ok(DoctorReport {
            foreground_hwnd: target.hwnd,
            pid: target.pid,
            tid: target.tid,
            process_name: target.process_name,
            exe_path: target.exe_path,
            current_hkl: hkl,
            lang_id,
            default_ime_hwnd: ime_wnd.0 as usize,
            ime_open_status,
            candidate_strategy,
            is_supported_browser: true,
        })
    }
}

#[cfg(windows)]
fn try_strategy_a_switch(target: &TargetWindowInfo) -> Result<Option<bool>> {
    unsafe {
        let hwnd = HWND(target.hwnd as *mut std::ffi::c_void);
        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);
        if ime_wnd.0.is_null() {
            return Ok(None);
        }

        let initial_open_res = SendMessageW(
            ime_wnd,
            WM_IME_CONTROL,
            WPARAM(IMC_GETOPENSTATUS),
            LPARAM(0),
        );
        let prev_open = initial_open_res.0 != 0;

        // Try setting IME open status to false (ASCII)
        SendMessageW(
            ime_wnd,
            WM_IME_CONTROL,
            WPARAM(IMC_SETOPENSTATUS),
            LPARAM(0),
        );

        // Verify that open status is now false
        let verified_res = SendMessageW(
            ime_wnd,
            WM_IME_CONTROL,
            WPARAM(IMC_GETOPENSTATUS),
            LPARAM(0),
        );
        let verified_closed = verified_res.0 == 0;

        if verified_closed {
            Ok(Some(prev_open))
        } else {
            Ok(None)
        }
    }
}

#[cfg(windows)]
fn try_strategy_b_switch(target: &TargetWindowInfo) -> Result<(usize, bool)> {
    unsafe {
        let hwnd = HWND(target.hwnd as *mut std::ffi::c_void);
        let prev_hkl = GetKeyboardLayout(target.tid).0 as usize;

        // If already US English (0x0409)
        if (prev_hkl & 0xFFFF) == 0x0409 {
            return Ok((prev_hkl, true));
        }

        let english_hkl = LoadKeyboardLayoutW(
            w!("00000409"),
            ACTIVATE_KEYBOARD_LAYOUT_FLAGS(KLF_NOTELLSHELL.0 | KLF_SUBSTITUTE_OK.0),
        )
        .context("Failed to load US English keyboard layout (00000409)")?;

        if english_hkl.0.is_null() {
            bail!("Loaded US English keyboard layout is null");
        }

        let _ = PostMessageW(
            hwnd,
            WM_INPUTLANGCHANGEREQUEST,
            WPARAM(0),
            LPARAM(english_hkl.0 as isize),
        );

        // Poll target thread HKL to verify switch
        let deadline = Instant::now() + Duration::from_millis(250);
        let mut verified = false;

        while Instant::now() < deadline {
            let current = GetKeyboardLayout(target.tid).0 as usize;
            if (current & 0xFFFF) == 0x0409 || current == english_hkl.0 as usize {
                verified = true;
                break;
            }
            thread::sleep(Duration::from_millis(15));
        }

        Ok((prev_hkl, verified))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_state_lifecycle() {
        let mut session = SessionState::new();
        assert!(!session.switched);
        assert!(session.target.is_none());

        // Test ping
        let ping_resp = session.handle_ping("ping-1");
        assert_eq!(ping_resp.id, "ping-1");
        assert!(ping_resp.ok);
        assert_eq!(ping_resp.action, "ping");

        // Test restore when not switched
        let restore_resp = session.restore("rest-1");
        assert_eq!(restore_resp.id, "rest-1");
        assert!(restore_resp.ok);
        assert_eq!(restore_resp.restored, Some(false));
    }
}
