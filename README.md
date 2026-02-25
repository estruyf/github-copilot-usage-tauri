# GitHub Copilot Usage Tracker

A system tray application built with Tauri that displays your GitHub Copilot
metered usage with real-time percentage bars for Premium requests.

<div align="center">
  <img src="screenshots/app-screenshot.png" alt="GitHub Copilot Usage App Screenshot" width="600">
  <p><em>Monitor your GitHub Copilot usage effortlessly</em></p>
</div>

## Features

- **System Tray Integration**: Lives in your system tray for quick access
- **Usage Visualization**: Visual progress bars showing Premium request usage
- **Auto-Refresh**: Automatically updates usage data every 5 minutes
- **Secure Token Storage**: Stores your GitHub token locally
- **Authentication Options**: Choose between automated GitHub OAuth or manual
  token entry
- **Cross-Platform**: Works on macOS, Windows, and Linux

## Prerequisites

- Node.js (v20 or higher)
- Rust (latest stable version)
- GitHub account with Copilot access (for automated authentication) or a
  Personal Access Token

If Rust is installed via `rustup`, make sure a toolchain is configured before
running Tauri:

```bash
rustup default stable
```

Optional (repo-local instead of changing your global default):

```bash
rustup override set stable
```

If no toolchain is configured, `tauri dev` fails while running `cargo metadata`
with an error like `rustup could not choose a version of cargo to run`.

### Linux (Ubuntu/Debian)

Tauri on Linux requires a few system libraries (GTK + WebKit) for the Rust
backend to compile.

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
```

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Usage

1. Launch the application
2. Choose your authentication method:
   - **Automated Authentication**: Click "🔑 Login with GitHub" to start the
     OAuth flow. Your browser will open to authorize the app, then enter the
     provided code when prompted.
   - **Manual Token Entry**: Enter your GitHub Personal Access Token directly
3. The app will fetch and display your Copilot usage
4. Click the system tray icon to show/hide the usage window
5. Usage data refreshes automatically every 5 minutes

## Authentication Setup

### Automated GitHub OAuth (Recommended)

The app uses GitHub's device code OAuth flow for secure authentication:

1. Click "🔑 Login with GitHub" in the app
2. Your default browser will open to GitHub's authorization page
3. Enter the displayed user code when prompted
4. Grant permission for Copilot access
5. The app will automatically receive and store your access token

### Manual Token Entry

If you prefer to use a Personal Access Token:

1. Create a token at: https://github.com/settings/tokens
2. Ensure it has the `copilot` scope (required for Copilot usage data)
3. Enter the token in the app's input field
4. Click "Save Token"

**Note**: The automated flow is recommended as it handles token refresh and uses
the correct scopes automatically.

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: Tauri (Rust)
- **Build Tool**: Vite
- **API**: GitHub Copilot Internal API

## License

MIT
