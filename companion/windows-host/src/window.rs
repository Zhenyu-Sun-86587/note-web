use anyhow::{bail, Context, Result};
use std::path::Path;

#[cfg(windows)]
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{CloseHandle, HWND},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow},
    },
};

#[derive(Debug, Clone)]
pub struct TargetWindowInfo {
    pub hwnd: usize,
    pub pid: u32,
    pub tid: u32,
    pub process_name: String,
    pub exe_path: String,
}

pub fn is_allowed_browser_executable(process_name: &str) -> bool {
    let lower = process_name.to_lowercase();
    lower == "msedge.exe"
        || lower == "chrome.exe"
        || lower == "chromium.exe"
        || lower == "brave.exe"
}

#[cfg(windows)]
pub fn get_foreground_target_window() -> Result<TargetWindowInfo> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() || hwnd.0 as isize == -1 {
            bail!("NO_FOREGROUND_WINDOW: No active foreground window detected");
        }

        let mut pid: u32 = 0;
        let tid = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if tid == 0 || pid == 0 {
            bail!(
                "INVALID_THREAD_PROCESS: Failed to get PID/TID for foreground window 0x{:X}",
                hwnd.0 as usize
            );
        }

        let (process_name, exe_path) = match get_process_name(pid) {
            Ok(pair) => pair,
            Err(e) => {
                bail!(
                    "TARGET_NOT_ACCESSIBLE: Could not query process for PID {}: {}",
                    pid,
                    e
                );
            }
        };

        if !is_allowed_browser_executable(&process_name) {
            bail!(
                "TARGET_NOT_BROWSER: Foreground process '{}' (PID {}) is not a supported browser (chrome.exe / msedge.exe)",
                process_name,
                pid
            );
        }

        Ok(TargetWindowInfo {
            hwnd: hwnd.0 as usize,
            pid,
            tid,
            process_name,
            exe_path,
        })
    }
}

#[cfg(not(windows))]
pub fn get_foreground_target_window() -> Result<TargetWindowInfo> {
    bail!("Windows APIs are only available on Windows");
}

#[cfg(windows)]
pub fn validate_target_window(hwnd_raw: usize, expected_pid: u32) -> bool {
    unsafe {
        let hwnd = HWND(hwnd_raw as *mut std::ffi::c_void);
        if !IsWindow(hwnd).as_bool() {
            return false;
        }
        let mut pid: u32 = 0;
        let tid = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        tid != 0 && pid == expected_pid
    }
}

#[cfg(not(windows))]
pub fn validate_target_window(_hwnd_raw: usize, _expected_pid: u32) -> bool {
    false
}

#[cfg(windows)]
fn get_process_name(pid: u32) -> Result<(String, String)> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
            .context("Failed to open process with PROCESS_QUERY_LIMITED_INFORMATION")?;
        if handle.is_invalid() {
            bail!("Invalid process handle for PID {}", pid);
        }

        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;

        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        );

        let _ = CloseHandle(handle);

        if result.is_err() {
            bail!("QueryFullProcessImageNameW failed for PID {}", pid);
        }

        let full_path = String::from_utf16_lossy(&buf[..size as usize]);
        let filename = Path::new(&full_path)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("unknown")
            .to_string();

        Ok((filename, full_path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allowed_browsers() {
        assert!(is_allowed_browser_executable("chrome.exe"));
        assert!(is_allowed_browser_executable("CHROME.EXE"));
        assert!(is_allowed_browser_executable("msedge.exe"));
        assert!(is_allowed_browser_executable("MSEDGE.EXE"));
        assert!(!is_allowed_browser_executable("notepad.exe"));
        assert!(!is_allowed_browser_executable("cmd.exe"));
        assert!(!is_allowed_browser_executable("pwsh.exe"));
    }
}
