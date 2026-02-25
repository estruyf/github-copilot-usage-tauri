use tauri::image::Image as TauriImage;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

mod auth;

#[tauri::command]
async fn fetch_copilot_usage(token: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://api.github.com/copilot_internal/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "GitHub-Copilot-Usage-Tray")
        .header("X-GitHub-Api-Version", "2025-05-01")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("API request failed: {}", response.status()));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

#[tauri::command]
fn close_app() {
    // Exit the application with success code 0
    std::process::exit(0);
}

#[tauri::command]
fn show_window(window: tauri::Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn set_tray_icon(app: tauri::AppHandle) -> Result<(), String> {
    // Use tauri's Image helper to build an Image from PNG/ICO bytes
    let bytes = include_bytes!("../tray-icon-light.png");
    let img = TauriImage::from_bytes(bytes).map_err(|e| format!("failed to create tauri image: {}", e))?;

    let tray = app.tray_by_id("main").ok_or("Tray not found")?;
    tray.set_icon(Some(img)).map_err(|e| format!("Failed to set tray icon: {e}"))?;
    tray.set_icon_as_template(true).map_err(|e| format!("Failed to set icon as template: {e}"))
}

/// Start GitHub device code authentication flow
/// Returns the user code and verification URL
#[tauri::command]
async fn start_auth_flow() -> Result<auth::AuthFlowState, String> {
    let device_code_response = auth::request_device_code().await?;
    eprintln!("Device code response: {:?}", device_code_response);

    Ok(auth::AuthFlowState {
        user_code: device_code_response.user_code,
        verification_uri: device_code_response.verification_uri,
        device_code: device_code_response.device_code,
        interval: device_code_response.interval,
    })
}

/// Request access token using device code
#[tauri::command]
async fn complete_auth_flow(device_code: String) -> Result<String, String> {
    println!("complete_auth_flow called with device_code: {}", device_code);
    eprintln!("Device code: {:?}", &device_code);
    let token = auth::request_token(&device_code).await?;
    Ok(token)
}

#[tauri::command]
async fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    let autostart = app.autolaunch();
    autostart.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
async fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    let autostart = app.autolaunch();
    autostart.enable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    let autostart = app.autolaunch();
    autostart.disable().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![
            fetch_copilot_usage, 
            show_window,
            close_app, 
            set_tray_icon,
            start_auth_flow,
            complete_auth_flow,
            is_autostart_enabled,
            enable_autostart,
            disable_autostart
        ])
        .on_window_event(|window, event| {
            // Intercept window close events: hide instead of close
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
