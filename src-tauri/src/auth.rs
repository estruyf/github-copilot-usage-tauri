use axum::{
    Router,
    routing::get,
    response::Html,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};

const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
// GitHub Copilot client ID
const CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
const SCOPES: &str = "read:user";

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthFlowState {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
}

/// State to hold the access token and shutdown signal
struct ServerState {
    access_token: Mutex<Option<String>>,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

/// Request device code from GitHub
pub async fn request_device_code() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", SCOPES),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to request device code: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Device code request failed: {}", response.status()));
    }
    
    response
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))
}

/// Poll for access token
pub async fn poll_for_token(device_code: &str, interval: u64) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;
        
        let response = client
            .post(GITHUB_ACCESS_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", CLIENT_ID),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed to poll for token: {}", e))?;
        
        let token_response: AccessTokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;
        
        if let Some(token) = token_response.access_token {
            return Ok(token);
        }
        
        if let Some(error) = token_response.error {
            match error.as_str() {
                "authorization_pending" => continue,
                "slow_down" => {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    continue;
                }
                "expired_token" => return Err("The device code has expired. Please start over.".to_string()),
                "access_denied" => return Err("Access was denied by the user.".to_string()),
                _ => return Err(format!("Authentication error: {}", error)),
            }
        }
    }
}

/// Start a local HTTP server to display the access token
pub async fn start_token_server(token: String, port: u16) -> Result<String, String> {
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    
    let state = Arc::new(ServerState {
        access_token: Mutex::new(Some(token.clone())),
        shutdown_tx: Mutex::new(Some(shutdown_tx)),
    });
    
    let state_for_route = state.clone();
    let app = Router::new()
        .route("/", get(move || {
            let state = state_for_route.clone();
            async move {
                let token = state.access_token.lock().await;
                let token_value = token.as_ref().map(|s| s.as_str()).unwrap_or("");
                Html(get_token_page(token_value))
            }
        }))
        .route("/close", get(move || {
            let state = state.clone();
            async move {
                if let Some(tx) = state.shutdown_tx.lock().await.take() {
                    let _ = tx.send(());
                }
                Html("<html><body><h1>Server closed. You can close this tab.</h1></body></html>".to_string())
            }
        }));
    
    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind to port {}: {}", port, e))?;
    
    let server_url = format!("http://{}", addr);
    
    // Spawn the server in a background task
    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });
    
    Ok(server_url)
}

fn get_token_page(token: &str) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Copilot Usage - Access Token</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            background-color: #0d1117;
            color: #f0f6fc;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }}
        .container {{
            background-color: #161b22;
            border-radius: 12px;
            padding: 32px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }}
        h1 {{
            color: #58a6ff;
            margin-bottom: 16px;
            font-size: 24px;
        }}
        p {{
            color: #8b949e;
            margin-bottom: 24px;
            line-height: 1.5;
        }}
        .token-container {{
            background-color: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
            position: relative;
        }}
        .token {{
            word-break: break-all;
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
            font-size: 14px;
            color: #f0f6fc;
            user-select: all;
        }}
        .btn {{
            display: inline-block;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 600;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            transition: background-color 0.2s;
            margin-right: 10px;
        }}
        .btn-primary {{
            background-color: #238636;
            color: #ffffff;
        }}
        .btn-primary:hover {{
            background-color: #2ea043;
        }}
        .btn-secondary {{
            background-color: #21262d;
            color: #f0f6fc;
            border: 1px solid #30363d;
        }}
        .btn-secondary:hover {{
            background-color: #30363d;
        }}
        .success {{
            display: none;
            color: #3fb950;
            margin-top: 12px;
            font-size: 14px;
        }}
        .instructions {{
            background-color: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 16px;
            margin-top: 24px;
        }}
        .instructions h3 {{
            color: #f0f6fc;
            margin-bottom: 12px;
            font-size: 16px;
        }}
        .instructions ol {{
            color: #8b949e;
            padding-left: 20px;
        }}
        .instructions li {{
            margin-bottom: 8px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Authentication Successful!</h1>
        <p>Your GitHub access token has been generated. Copy it below and paste it into the GitHub Copilot Usage app.</p>
        
        <div class="token-container">
            <code class="token" id="token">{}</code>
        </div>
        
        <div>
            <button class="btn btn-primary" onclick="copyToken()">Copy Token</button>
            <a href="/close" class="btn btn-secondary">Close Server</a>
        </div>
        
        <div class="success" id="success">✓ Token copied to clipboard!</div>
        
        <div class="instructions">
            <h3>Next Steps:</h3>
            <ol>
                <li>Click "Copy Token" to copy the access token</li>
                <li>Go back to the GitHub Copilot Usage app</li>
                <li>Paste the token in the token field</li>
                <li>Click "Save Token" to complete setup</li>
            </ol>
        </div>
    </div>
    
    <script>
        function copyToken() {{
            const token = document.getElementById('token').textContent;
            navigator.clipboard.writeText(token).then(() => {{
                document.getElementById('success').style.display = 'block';
                setTimeout(() => {{
                    document.getElementById('success').style.display = 'none';
                }}, 3000);
            }});
        }}
    </script>
</body>
</html>"#, token)
}
