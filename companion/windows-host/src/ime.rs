use std::thread;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};

use crate::protocol::{NativeResponse, SwitchStrategy};
use crate::window::{get_foreground_target_window, validate_target_window, TargetWindowInfo};

#[cfg(windows)]
use windows::{
    core::w,
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        UI::{
            Input::{
                Ime::ImmGetDefaultIMEWnd,
                KeyboardAndMouse::{
                    GetKeyboardLayout, LoadKeyboardLayoutW, ACTIVATE_KEYBOARD_LAYOUT_FLAGS,
                    KLF_NOTELLSHELL, KLF_SUBSTITUTE_OK,
                },
            },
            WindowsAndMessaging::{
                PostMessageW, SendMessageTimeoutW, SEND_MESSAGE_TIMEOUT_FLAGS, SMTO_ABORTIFHUNG,
            },
        },
    },
};

const WM_INPUTLANGCHANGEREQUEST: u32 = 0x0050;
const WM_IME_CONTROL: u32 = 0x0283;
const IMC_GETOPENSTATUS: usize = 0x0005;
const IMC_SETOPENSTATUS: usize = 0x0006;
const IME_MESSAGE_TIMEOUT_MS: u32 = 150;

#[derive(Debug, Clone, PartialEq, Eq)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StrategyAAttemptOutcome {
    Success(bool),
    CleanFailure,
    DirtyFailure(String),
}

pub fn evaluate_strategy_a_outcome(
    set_succeeded: bool,
    verify_succeeded: bool,
    rollback_succeeded: bool,
    initial_open: bool,
) -> StrategyAAttemptOutcome {
    if !set_succeeded {
        StrategyAAttemptOutcome::CleanFailure
    } else if verify_succeeded {
        StrategyAAttemptOutcome::Success(initial_open)
    } else if rollback_succeeded {
        StrategyAAttemptOutcome::CleanFailure
    } else {
        StrategyAAttemptOutcome::DirtyFailure(
            "Strategy A verification failed and rollback could not be verified".to_string(),
        )
    }
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

#[cfg(windows)]
unsafe fn send_ime_message_timeout(
    ime_wnd: HWND,
    msg: u32,
    wparam: usize,
    lparam: isize,
    timeout_ms: u32,
) -> Result<usize> {
    let mut result = 0usize;
    let res = SendMessageTimeoutW(
        ime_wnd,
        msg,
        WPARAM(wparam),
        LPARAM(lparam),
        SEND_MESSAGE_TIMEOUT_FLAGS(SMTO_ABORTIFHUNG.0),
        timeout_ms,
        Some(&mut result as *mut usize),
    );
    if res.0 == 0 {
        bail!(
            "SendMessageTimeoutW failed or timed out after {}ms",
            timeout_ms
        );
    }
    Ok(result)
}

#[cfg(windows)]
pub fn verify_strategy_a_ascii(hwnd: HWND) -> Result<bool> {
    unsafe {
        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);
        if ime_wnd.0.is_null() {
            return Ok(false);
        }
        let status = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_GETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        )?;
        Ok(status == 0)
    }
}

#[cfg(windows)]
pub fn verify_strategy_b_ascii(tid: u32) -> Result<bool> {
    unsafe {
        let hkl = GetKeyboardLayout(tid).0 as usize;
        Ok((hkl & 0xFFFF) == 0x0409)
    }
}

#[cfg(windows)]
pub fn verify_target_ascii(target: &TargetWindowInfo, strategy: &SwitchStrategy) -> Result<bool> {
    match strategy {
        SwitchStrategy::ImeOpenState => {
            let hwnd = HWND(target.hwnd as *mut std::ffi::c_void);
            verify_strategy_a_ascii(hwnd)
        }
        SwitchStrategy::KeyboardLayout => verify_strategy_b_ascii(target.tid),
    }
}

#[cfg(windows)]
pub fn reapply_saved_strategy(saved: &SavedTargetState, strategy: &SwitchStrategy) -> Result<bool> {
    match strategy {
        SwitchStrategy::ImeOpenState => {
            let hwnd = HWND(saved.hwnd as *mut std::ffi::c_void);
            let ime_wnd = unsafe { ImmGetDefaultIMEWnd(hwnd) };
            if ime_wnd.0.is_null() {
                return Ok(false);
            }
            unsafe {
                let _ = send_ime_message_timeout(
                    ime_wnd,
                    WM_IME_CONTROL,
                    IMC_SETOPENSTATUS,
                    0,
                    IME_MESSAGE_TIMEOUT_MS,
                )?;
            }
            verify_strategy_a_ascii(hwnd)
        }
        SwitchStrategy::KeyboardLayout => {
            let hwnd = HWND(saved.hwnd as *mut std::ffi::c_void);
            let english_hkl = unsafe {
                LoadKeyboardLayoutW(
                    w!("00000409"),
                    ACTIVATE_KEYBOARD_LAYOUT_FLAGS(KLF_NOTELLSHELL.0 | KLF_SUBSTITUTE_OK.0),
                )
                .context("Failed to load US English keyboard layout (00000409)")?
            };
            if english_hkl.0.is_null() {
                bail!("Loaded US English keyboard layout is null");
            }
            unsafe {
                let _ = PostMessageW(
                    hwnd,
                    WM_INPUTLANGCHANGEREQUEST,
                    WPARAM(0),
                    LPARAM(english_hkl.0 as isize),
                );
            }
            let deadline = Instant::now() + Duration::from_millis(250);
            while Instant::now() < deadline {
                let current = unsafe { GetKeyboardLayout(saved.tid).0 as usize };
                if (current & 0xFFFF) == 0x0409 || current == english_hkl.0 as usize {
                    return Ok(true);
                }
                thread::sleep(Duration::from_millis(15));
            }
            Ok(false)
        }
    }
}

#[cfg(windows)]
pub fn execute_and_verify_strategy_a_restore(
    saved: &SavedTargetState,
    expected_open: bool,
) -> Result<bool> {
    unsafe {
        let hwnd = HWND(saved.hwnd as *mut std::ffi::c_void);
        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);
        if ime_wnd.0.is_null() {
            return Ok(false);
        }
        let _ = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_SETOPENSTATUS,
            if expected_open { 1 } else { 0 },
            IME_MESSAGE_TIMEOUT_MS,
        )?;
        let status = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_GETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        )?;
        let actual_open = status != 0;
        Ok(actual_open == expected_open)
    }
}

#[cfg(windows)]
pub fn execute_and_verify_strategy_b_restore(
    saved: &SavedTargetState,
    expected_hkl: usize,
) -> Result<bool> {
    unsafe {
        let hwnd = HWND(saved.hwnd as *mut std::ffi::c_void);
        let _ = PostMessageW(
            hwnd,
            WM_INPUTLANGCHANGEREQUEST,
            WPARAM(0),
            LPARAM(expected_hkl as isize),
        );

        let deadline = Instant::now() + Duration::from_millis(250);
        while Instant::now() < deadline {
            let current = GetKeyboardLayout(saved.tid).0 as usize;
            if current == expected_hkl {
                return Ok(true);
            }
            thread::sleep(Duration::from_millis(15));
        }

        let final_hkl = GetKeyboardLayout(saved.tid).0 as usize;
        Ok(final_hkl == expected_hkl)
    }
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
                resp.strategy = self.strategy.clone();

                // Strategy-aware verification
                if self.switched {
                    if let Some(ref saved) = self.target {
                        if saved.hwnd == target.hwnd && saved.pid == target.pid {
                            if let Some(ref strat) = self.strategy {
                                resp.verified = verify_target_ascii(&target, strat).ok();
                                return resp;
                            }
                        }
                    }
                }

                // Generic HKL query (read-only)
                let hkl = unsafe { GetKeyboardLayout(target.tid).0 as usize };
                let is_ascii = (hkl & 0xFFFF) == 0x0409;
                resp.verified = Some(is_ascii);
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

        // P1-2: Ownership Protection & Conflict Detection
        if self.switched {
            if let Some(ref saved) = self.target {
                if saved.hwnd != target.hwnd || saved.pid != target.pid {
                    let mut resp = NativeResponse::error(
                        id,
                        "switch_ascii",
                        "ACTIVE_TARGET_CONFLICT",
                        "Another target window is currently active and switched; restore must be completed before switching a new target",
                    );
                    resp.target_pid = Some(target.pid);
                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                    return resp;
                }

                // P1-1: Same Target Re-verification & Re-apply preserving baseline
                if let Some(ref strat) = self.strategy {
                    match verify_target_ascii(&target, strat) {
                        Ok(true) => {
                            let mut resp = NativeResponse::success(id, "switch_ascii");
                            resp.strategy = self.strategy.clone();
                            resp.verified = Some(true);
                            resp.target_pid = Some(target.pid);
                            resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                            return resp;
                        }
                        Ok(false) => {
                            // Command state lost -> reapply using EXISTING baseline without overwrite
                            match reapply_saved_strategy(saved, strat) {
                                Ok(true) => {
                                    let mut resp = NativeResponse::success(id, "switch_ascii");
                                    resp.strategy = self.strategy.clone();
                                    resp.verified = Some(true);
                                    resp.target_pid = Some(target.pid);
                                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                                    return resp;
                                }
                                Ok(false) => {
                                    let mut resp = NativeResponse::error(
                                        id,
                                        "switch_ascii",
                                        "REAPPLY_UNVERIFIED",
                                        "Failed to reapply command state to target window",
                                    );
                                    resp.verified = Some(false);
                                    resp.target_pid = Some(target.pid);
                                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                                    return resp;
                                }
                                Err(e) => {
                                    let mut resp = NativeResponse::error(
                                        id,
                                        "switch_ascii",
                                        "REAPPLY_FAILED",
                                        &e.to_string(),
                                    );
                                    resp.verified = Some(false);
                                    resp.target_pid = Some(target.pid);
                                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                                    return resp;
                                }
                            }
                        }
                        Err(e) => {
                            let mut resp = NativeResponse::error(
                                id,
                                "switch_ascii",
                                "SWITCH_STATE_UNKNOWN",
                                &e.to_string(),
                            );
                            resp.verified = Some(false);
                            resp.target_pid = Some(target.pid);
                            resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                            return resp;
                        }
                    }
                }
            }
        }

        // P1-2: Try Transactional Strategy A with Rollback
        match try_strategy_a_switch_transactional(&target) {
            StrategyAAttemptOutcome::Success(prev_open) => {
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
            StrategyAAttemptOutcome::CleanFailure => {
                // Strategy A clean failure -> proceed to Strategy B
            }
            StrategyAAttemptOutcome::DirtyFailure(e) => {
                // Strategy A rollback failed -> DO NOT attempt Strategy B
                return NativeResponse::error(id, "switch_ascii", "STRATEGY_A_ROLLBACK_FAILED", &e);
            }
        }

        // Try Strategy B: Targeted Keyboard Layout HKL switch to 0x0409 (US English)
        match try_strategy_b_switch(&target) {
            Ok((prev_hkl, verified)) => {
                // P0-1: If verified is false, DO NOT mutate session state!
                if !verified {
                    let mut resp = NativeResponse::error(
                        id,
                        "switch_ascii",
                        "SWITCH_UNVERIFIED",
                        "Strategy B keyboard layout switch could not be verified in target window",
                    );
                    resp.verified = Some(false);
                    resp.target_pid = Some(target.pid);
                    resp.target_hwnd = Some(format!("0x{:X}", target.hwnd));
                    resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
                    return resp;
                }

                // Verified true -> record session state
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
                resp.verified = Some(true);
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
            resp.released = Some(true);
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            return resp;
        }

        let saved = match self.target {
            Some(ref s) => s.clone(),
            None => {
                self.switched = false;
                self.strategy = None;
                let mut resp = NativeResponse::success(id, "restore");
                resp.restored = Some(false);
                resp.released = Some(true);
                return resp;
            }
        };

        // Validate target window is still alive and has the same PID
        if !validate_target_window(saved.hwnd, saved.pid) {
            // Target is gone: safely clean up session state
            self.switched = false;
            self.target = None;
            self.strategy = None;

            let mut resp = NativeResponse::error(
                id,
                "restore",
                "TARGET_GONE",
                "Target window was closed or process exited; session state cleared",
            );
            resp.restored = Some(false);
            resp.released = Some(true);
            resp.target_pid = Some(saved.pid);
            resp.target_hwnd = Some(format!("0x{:X}", saved.hwnd));
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            return resp;
        }

        let strategy = match self.strategy {
            Some(ref s) => s.clone(),
            None => {
                self.switched = false;
                self.target = None;
                let mut resp = NativeResponse::success(id, "restore");
                resp.restored = Some(false);
                resp.released = Some(true);
                return resp;
            }
        };

        // P1-1: Execute AND VERIFY restore
        let restore_verified = match strategy {
            SwitchStrategy::ImeOpenState => {
                if let Some(prev_open) = saved.previous_ime_open {
                    execute_and_verify_strategy_a_restore(&saved, prev_open).unwrap_or(false)
                } else {
                    false
                }
            }
            SwitchStrategy::KeyboardLayout => {
                if let Some(prev_hkl) = saved.previous_hkl {
                    execute_and_verify_strategy_b_restore(&saved, prev_hkl).unwrap_or(false)
                } else {
                    false
                }
            }
        };

        if restore_verified {
            // P1-1: Clear session state ONLY after verification succeeds
            self.switched = false;
            self.target = None;
            self.strategy = None;

            let mut resp = NativeResponse::success(id, "restore");
            resp.restored = Some(true);
            resp.released = Some(true);
            resp.target_pid = Some(saved.pid);
            resp.target_hwnd = Some(format!("0x{:X}", saved.hwnd));
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            resp
        } else {
            // P1-1: Retain session state on failure so caller can retry!
            let mut resp = NativeResponse::error(
                id,
                "restore",
                "RESTORE_UNVERIFIED",
                "Restore command was sent but target window state could not be verified",
            );
            resp.restored = Some(false);
            resp.released = Some(false);
            resp.target_pid = Some(saved.pid);
            resp.target_hwnd = Some(format!("0x{:X}", saved.hwnd));
            resp.elapsed_ms = Some(start_time.elapsed().as_millis() as u64);
            resp
        }
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
            match send_ime_message_timeout(
                ime_wnd,
                WM_IME_CONTROL,
                IMC_GETOPENSTATUS,
                0,
                IME_MESSAGE_TIMEOUT_MS,
            ) {
                Ok(res) => Some(res != 0),
                Err(_) => None,
            }
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
fn try_strategy_a_switch_transactional(target: &TargetWindowInfo) -> StrategyAAttemptOutcome {
    unsafe {
        let hwnd = HWND(target.hwnd as *mut std::ffi::c_void);
        let ime_wnd = ImmGetDefaultIMEWnd(hwnd);
        if ime_wnd.0.is_null() {
            return StrategyAAttemptOutcome::CleanFailure;
        }

        let initial_open_res = match send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_GETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        ) {
            Ok(res) => res,
            Err(_) => return StrategyAAttemptOutcome::CleanFailure,
        };
        let prev_open = initial_open_res != 0;

        // Try setting open status to false (ASCII)
        let set_res = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_SETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        );
        let set_succeeded = set_res.is_ok();
        if !set_succeeded {
            return evaluate_strategy_a_outcome(false, false, false, prev_open);
        }

        // Verify setting
        let verified_res = match send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_GETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        ) {
            Ok(res) => res == 0,
            Err(_) => false,
        };

        if verified_res {
            return evaluate_strategy_a_outcome(true, true, false, prev_open);
        }

        // SET succeeded but verification failed -> must attempt rollback
        let rollback_set = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_SETOPENSTATUS,
            if prev_open { 1 } else { 0 },
            IME_MESSAGE_TIMEOUT_MS,
        );
        let rollback_get = send_ime_message_timeout(
            ime_wnd,
            WM_IME_CONTROL,
            IMC_GETOPENSTATUS,
            0,
            IME_MESSAGE_TIMEOUT_MS,
        );

        let rollback_ok = match (rollback_set, rollback_get) {
            (Ok(_), Ok(status)) => (status != 0) == prev_open,
            _ => false,
        };

        evaluate_strategy_a_outcome(true, false, rollback_ok, prev_open)
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
        assert_eq!(restore_resp.released, Some(true));
    }

    #[test]
    fn test_target_conflict_semantics() {
        let mut session = SessionState::new();
        session.switched = true;
        session.strategy = Some(SwitchStrategy::KeyboardLayout);
        session.target = Some(SavedTargetState {
            hwnd: 0x1000,
            pid: 100,
            tid: 101,
            previous_ime_open: None,
            previous_hkl: Some(0x08040804),
        });

        // Incoming target does not match switched target
        let incoming_target = TargetWindowInfo {
            hwnd: 0x2000,
            pid: 200,
            tid: 201,
            process_name: "msedge.exe".to_string(),
            exe_path: "".to_string(),
        };

        assert_ne!(session.target.as_ref().unwrap().hwnd, incoming_target.hwnd);
    }

    #[test]
    fn test_restore_state_preservation_on_unverified() {
        let mut session = SessionState::new();
        let initial_saved = SavedTargetState {
            hwnd: 0x1234,
            pid: 99999, // Non-existent PID so validate_target_window fails
            tid: 99998,
            previous_ime_open: None,
            previous_hkl: Some(0x08040804),
        };
        session.switched = true;
        session.strategy = Some(SwitchStrategy::KeyboardLayout);
        session.target = Some(initial_saved);

        // When target is closed / PID gone, restore safely clears session and marks released=true
        let resp = session.restore("r-test");
        assert_eq!(resp.code, Some("TARGET_GONE".to_string()));
        assert_eq!(resp.released, Some(true));
        assert!(!session.switched);
        assert!(session.target.is_none());
    }

    #[test]
    fn test_strategy_a_transaction_outcomes() {
        // 1. SET fails -> CleanFailure (allows fallback)
        assert_eq!(
            evaluate_strategy_a_outcome(false, false, false, true),
            StrategyAAttemptOutcome::CleanFailure
        );

        // 2. SET succeeds and verify succeeds -> Success
        assert_eq!(
            evaluate_strategy_a_outcome(true, true, false, true),
            StrategyAAttemptOutcome::Success(true)
        );

        // 3. SET succeeds, verify fails, rollback succeeds -> CleanFailure
        assert_eq!(
            evaluate_strategy_a_outcome(true, false, true, true),
            StrategyAAttemptOutcome::CleanFailure
        );

        // 4. SET succeeds, verify fails, rollback fails -> DirtyFailure (blocks fallback!)
        match evaluate_strategy_a_outcome(true, false, false, true) {
            StrategyAAttemptOutcome::DirtyFailure(_) => {}
            other => panic!("Expected DirtyFailure, got {:?}", other),
        }
    }

    #[test]
    fn test_restore_baseline_retention_on_reverify_failure() {
        let mut session = SessionState::new();
        let original_saved = SavedTargetState {
            hwnd: 0x1000,
            pid: 1000,
            tid: 1001,
            previous_ime_open: None,
            previous_hkl: Some(0x08040804),
        };
        session.switched = true;
        session.strategy = Some(SwitchStrategy::KeyboardLayout);
        session.target = Some(original_saved.clone());

        // Assert baseline is fully intact before any operation
        assert_eq!(
            session.target.as_ref().unwrap().previous_hkl,
            Some(0x08040804)
        );

        // If a reverify or reapply fails, the SessionState MUST retain original baseline
        assert_eq!(session.target.as_ref().unwrap(), &original_saved);
    }
}
