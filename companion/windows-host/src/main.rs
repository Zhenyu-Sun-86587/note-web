mod ime;
mod native_messaging;
mod protocol;
mod window;

use std::env;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

use anyhow::Result;

use ime::{run_doctor, SessionState};
use native_messaging::{read_message, write_message};
use protocol::{NativeAction, NativeResponse};

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() > 1 {
        let cmd = args[1].as_str();
        match cmd {
            "doctor" => {
                return run_doctor_cli();
            }
            "get" => {
                return run_get_cli();
            }
            "roundtrip" => {
                return run_roundtrip_cli();
            }
            "--help" | "-h" | "help" => {
                print_help();
                return Ok(());
            }
            arg if arg.starts_with("--parent-window=") => {
                // Invoked via Native Messaging with parent window flag
                return run_native_messaging_loop();
            }
            _ => {
                eprintln!("Unknown argument: {}", cmd);
                print_help();
                return Ok(());
            }
        }
    }

    run_native_messaging_loop()
}

fn print_help() {
    println!("Note Web Vim IME Companion Native Host (note-web-ime)");
    println!();
    println!("Usage:");
    println!("  note-web-ime.exe [COMMAND]");
    println!();
    println!("Commands:");
    println!("  doctor     Inspect foreground window, IME state, and candidate strategies");
    println!("  get        Query current foreground window input status");
    println!("  roundtrip  Interactive roundtrip test (switch to ASCII, test, then restore)");
    println!("  help       Show this help message");
    println!();
    println!("When executed without arguments, runs in Chrome/Edge Native Messaging mode.");
}

fn run_doctor_cli() -> Result<()> {
    println!("============================================================");
    println!("Note Web Vim IME Companion — Doctor Report");
    println!("============================================================");

    #[cfg(windows)]
    match run_doctor() {
        Ok(doc) => {
            println!("Foreground HWND:       0x{:X}", doc.foreground_hwnd);
            println!("Foreground PID:        {}", doc.pid);
            println!("Foreground TID:        {}", doc.tid);
            println!("Process Name:          {}", doc.process_name);
            println!("Executable Path:       {}", doc.exe_path);
            println!("Supported Browser:     {}", doc.is_supported_browser);
            println!("Current HKL:           0x{:X}", doc.current_hkl);
            println!("Language ID:           0x{:04X}", doc.lang_id);
            println!("Default IME HWND:      0x{:X}", doc.default_ime_hwnd);
            println!(
                "IME Open Status:       {}",
                match doc.ime_open_status {
                    Some(true) => "Open (Chinese mode)",
                    Some(false) => "Closed (ASCII mode)",
                    None => "Unavailable / Unsupported",
                }
            );
            println!("Candidate Strategy:    {}", doc.candidate_strategy);
        }
        Err(e) => {
            println!("Doctor Error: {}", e);
        }
    }

    #[cfg(not(windows))]
    println!("Doctor is only supported on Windows.");

    println!("============================================================");
    Ok(())
}

fn run_get_cli() -> Result<()> {
    let session = SessionState::new();
    let resp = session.handle_get_state("cli-get");
    let json = serde_json::to_string_pretty(&resp)?;
    println!("{}", json);
    Ok(())
}

fn run_roundtrip_cli() -> Result<()> {
    println!("============================================================");
    println!("Note Web Vim IME Companion — Interactive Roundtrip Gate");
    println!("============================================================");
    println!("Please make sure your target browser (Edge or Chrome with Note Web) is open.");
    println!("We will detect the foreground browser window in 3 seconds.");
    println!("Please click on your Note Web browser window NOW...");
    println!();

    for i in (1..=3).rev() {
        println!("Detecting target window in {}...", i);
        thread::sleep(Duration::from_secs(1));
    }

    let mut session = SessionState::new();

    println!();
    println!("1. Inspecting foreground target window...");
    let initial_report = match run_doctor() {
        Ok(doc) => {
            println!(
                "   -> Target: {} (PID: {}, HWND: 0x{:X})",
                doc.process_name, doc.pid, doc.foreground_hwnd
            );
            println!(
                "   -> Current HKL: 0x{:X}, LANGID: 0x{:04X}",
                doc.current_hkl, doc.lang_id
            );
            doc
        }
        Err(e) => {
            eprintln!("   [ERROR] Could not detect target browser: {}", e);
            eprintln!("   Please ensure Edge or Chrome is in the foreground!");
            return Ok(());
        }
    };

    println!();
    println!("2. Switching target window to ASCII input mode...");
    let switch_resp = session.switch_ascii("roundtrip-switch");
    if !switch_resp.ok {
        eprintln!(
            "   [FAIL] switch_ascii failed: {:?} - {:?}",
            switch_resp.code, switch_resp.message
        );
        return Ok(());
    }

    println!("   [OK] switch_ascii succeeded!");
    println!("   Strategy used: {:?}", switch_resp.strategy);
    println!("   Verified:      {:?}", switch_resp.verified);
    println!("   Elapsed:       {:?} ms", switch_resp.elapsed_ms);
    println!();
    println!("============================================================");
    println!(">>> VERIFICATION STEP:");
    println!(">>> Go back to your browser window now.");
    println!(">>> Type 'nihao' or 'i' in the browser.");
    println!(">>> Confirm that NO Chinese pinyin candidate window appears!");
    println!("============================================================");
    println!();
    print!("Press [ENTER] when ready to restore original input layout... ");
    io::stdout().flush()?;

    let stdin = io::stdin();
    let mut line = String::new();
    let _ = stdin.lock().read_line(&mut line);

    println!();
    println!(
        "3. Restoring original input state for HWND 0x{:X}...",
        initial_report.foreground_hwnd
    );
    let restore_resp = session.restore("roundtrip-restore");
    if !restore_resp.ok {
        eprintln!(
            "   [FAIL] restore failed: {:?} - {:?}",
            restore_resp.code, restore_resp.message
        );
        return Ok(());
    }

    println!("   [OK] restore succeeded!");
    println!("   Restored: {:?}", restore_resp.restored);
    println!("   Elapsed:  {:?} ms", restore_resp.elapsed_ms);
    println!();
    println!("============================================================");
    println!(">>> FINAL CHECK:");
    println!(">>> Return to your browser and verify Chinese IME is back!");
    println!("============================================================");
    Ok(())
}

fn run_native_messaging_loop() -> Result<()> {
    eprintln!("[note-web-ime] Starting Native Messaging host loop (com.noteweb.ime)");

    let mut session = SessionState::new();
    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout();

    loop {
        match read_message(&mut stdin) {
            Ok(Some(req)) => {
                eprintln!(
                    "[note-web-ime] Received request: id={}, action={:?}",
                    req.id, req.action
                );
                let resp = match req.action {
                    NativeAction::Ping => session.handle_ping(&req.id),
                    NativeAction::GetState => session.handle_get_state(&req.id),
                    NativeAction::SwitchAscii => session.switch_ascii(&req.id),
                    NativeAction::Restore => session.restore(&req.id),
                };

                if let Err(e) = write_message(&mut stdout, &resp) {
                    eprintln!("[note-web-ime] Error writing response: {}", e);
                    break;
                }
            }
            Ok(None) => {
                eprintln!("[note-web-ime] EOF received on stdin. Exiting cleanly.");
                break;
            }
            Err(e) => {
                eprintln!("[note-web-ime] Error reading incoming message: {}", e);
                let err_resp =
                    NativeResponse::error("unknown", "error", "INVALID_MESSAGE", &e.to_string());
                let _ = write_message(&mut stdout, &err_resp);
                break;
            }
        }
    }

    // Best-effort cleanup upon disconnect
    if session.switched {
        eprintln!("[note-web-ime] Cleaning up active session on exit");
        let _ = session.restore("cleanup-on-exit");
    }

    Ok(())
}
