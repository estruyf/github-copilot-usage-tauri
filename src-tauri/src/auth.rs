use serde::{Deserialize, Serialize};

const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
// GitHub Copilot's OAuth client ID - This is a public client ID used for device code flow
// It's safe to use because device code flow is designed for native apps that can't keep secrets
const CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
const SCOPES: &str = "read:email";

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

/// Request access token using device code
pub async fn request_token(device_code: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    
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
        .map_err(|e| format!("Failed to retrieve token: {}", e))?;
    
    let token_response: AccessTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;
    
    if let Some(token) = token_response.access_token {
        return Ok(token);
    }
    
    if let Some(error) = token_response.error {
        match error.as_str() {
            "authorization_pending" => return Err("Authorization is still pending. Please wait.".to_string()),
            "expired_token" => return Err("The device code has expired. Please start over.".to_string()),
            "access_denied" => return Err("Access was denied by the user.".to_string()),
            _ => return Err(format!("Authentication error: {}", error)),
        }
    }
    else {
        return Err("Unexpected response: no access token or error field".to_string())
    }
}
