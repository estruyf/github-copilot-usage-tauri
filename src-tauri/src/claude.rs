use serde::{Deserialize, Serialize};
use std::process::Command;

const CLAUDE_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";
// The OAuth tokens Claude Code stores are scoped to this beta.
const OAUTH_BETA: &str = "oauth-2025-04-20";

#[derive(Debug, Deserialize)]
struct StoredCredentials {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: ClaudeAiOauth,
}

#[derive(Debug, Deserialize)]
struct ClaudeAiOauth {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "expiresAt")]
    expires_at: Option<i64>,
    #[serde(rename = "subscriptionType")]
    subscription_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeStatus {
    /// Whether a Claude Code login could be found on this machine.
    pub available: bool,
    /// "max", "pro", ... when the credentials expose it.
    pub subscription_type: Option<String>,
    /// The stored access token is past its expiry - Claude Code needs to refresh it.
    pub expired: bool,
    /// Why we could not find credentials, for display in the UI.
    pub reason: Option<String>,
}

/// Read the raw credentials JSON that Claude Code stores.
///
/// macOS keeps it in the login keychain, other platforms in `~/.claude/.credentials.json`.
/// We deliberately re-read this on every call instead of caching or refreshing the token
/// ourselves: Claude Code owns the refresh and writes the new token straight back here,
/// so re-reading always picks up a valid token without two apps racing on the refresh.
fn read_raw_credentials() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(raw) = read_from_keychain() {
            return Ok(raw);
        }
    }

    read_from_credentials_file()
}

#[cfg(target_os = "macos")]
fn read_from_keychain() -> Option<String> {
    let user = std::env::var("USER").ok();

    // Claude Code stores the item under the current account name, but fall back to a
    // service-only lookup in case the item was written with a different account.
    let mut attempts: Vec<Vec<String>> = Vec::new();
    if let Some(user) = user {
        attempts.push(vec![
            "find-generic-password".into(),
            "-s".into(),
            KEYCHAIN_SERVICE.into(),
            "-a".into(),
            user,
            "-w".into(),
        ]);
    }
    attempts.push(vec![
        "find-generic-password".into(),
        "-s".into(),
        KEYCHAIN_SERVICE.into(),
        "-w".into(),
    ]);

    for args in attempts {
        let output = Command::new("security").args(&args).output().ok()?;
        if output.status.success() {
            let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !raw.is_empty() {
                return Some(raw);
            }
        }
    }

    None
}

fn read_from_credentials_file() -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "Could not determine the home directory".to_string())?;
    let path = std::path::Path::new(&home)
        .join(".claude")
        .join(".credentials.json");

    if !path.exists() {
        return Err("No Claude Code login found. Sign in with the Claude Code CLI first.".into());
    }

    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Claude credentials: {}", e))
}

fn parse_credentials(raw: &str) -> Result<ClaudeAiOauth, String> {
    serde_json::from_str::<StoredCredentials>(raw)
        .map(|c| c.claude_ai_oauth)
        .map_err(|e| format!("Failed to parse Claude credentials: {}", e))
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Report whether Claude usage can be shown, without fetching anything.
#[tauri::command]
pub async fn claude_status() -> ClaudeStatus {
    match read_raw_credentials().and_then(|raw| parse_credentials(&raw)) {
        Ok(creds) => ClaudeStatus {
            available: true,
            expired: creds.expires_at.map(|e| e <= now_millis()).unwrap_or(false),
            subscription_type: creds.subscription_type,
            reason: None,
        },
        Err(reason) => ClaudeStatus {
            available: false,
            subscription_type: None,
            expired: false,
            reason: Some(reason),
        },
    }
}

/// Fetch the current Claude subscription usage windows.
#[tauri::command]
pub async fn fetch_claude_usage() -> Result<String, String> {
    let creds = parse_credentials(&read_raw_credentials()?)?;

    let client = reqwest::Client::new();
    let response = client
        .get(CLAUDE_USAGE_URL)
        .header("Authorization", format!("Bearer {}", creds.access_token))
        .header("anthropic-beta", OAUTH_BETA)
        .header("Accept", "application/json")
        .header("User-Agent", "GitHub-Copilot-Usage-Tray")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(
                "Claude login expired. Run the Claude Code CLI once to refresh it.".into(),
            );
        }
        return Err(format!("Claude usage request failed: {}", status));
    }

    response.text().await.map_err(|e| e.to_string())
}
