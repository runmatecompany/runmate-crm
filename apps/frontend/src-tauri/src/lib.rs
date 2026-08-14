// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn tailscale_candidates() -> Vec<std::path::PathBuf> {
    #[cfg(windows)]
    {
        vec![
            std::path::PathBuf::from(r"C:\Program Files\Tailscale\tailscale.exe"),
            std::path::PathBuf::from("tailscale.exe"),
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![
            std::path::PathBuf::from("/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
            std::path::PathBuf::from("/usr/local/bin/tailscale"),
            std::path::PathBuf::from("/opt/homebrew/bin/tailscale"),
            std::path::PathBuf::from("tailscale"),
        ]
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        vec![std::path::PathBuf::from("tailscale")]
    }
}

/// Elindítja a tailscale-t (`up`) vagy leállítja a kapcsolatot (`down`) a
/// háttérben. Ha a tailscale nincs telepítve, csendben kihagyjuk — ez nem
/// akadályozhatja meg az app indulását/bezárását.
fn run_tailscale(args: &'static [&str]) {
    for candidate in tailscale_candidates() {
        let mut cmd = std::process::Command::new(&candidate);
        cmd.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        if cmd.spawn().is_ok() {
            return;
        }
    }
    eprintln!("[tailscale] a tailscale parancssori eszköz nem található, kihagyva: {:?}", args);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|_app| {
            std::thread::spawn(|| run_tailscale(&["up"]));
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                run_tailscale(&["down"]);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
