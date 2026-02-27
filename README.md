# Claude Code Remote

Control [Claude Code](https://docs.anthropic.com/en/docs/claude-code) from your Android phone over your Tailscale network. A lightweight daemon runs on your PC and relays a full terminal session to the mobile app via WebSocket.
Take over existing Claude Code sessions and control them from your phone, or run new ones directly from your android device. The system uses Tailscale to encrypt all traffic between your phone and PC.

```
┌─────────────┐         ┌───────────────┐         ┌──────────────┐
│  Android App │──WS───▶│  Tailscale    │──WS───▶│  PC Daemon   │
│  (xterm.js)  │◀──────│  (WireGuard)  │◀──────│  (node-pty)  │
└─────────────┘         └───────────────┘         └──────┬───────┘
                                                         │
                                                   ┌─────▼──────┐
                                                   │ Claude Code │
                                                   │   (CLI)     │
                                                   └────────────┘
```

## Prerequisites

- **PC:** Node.js 18+, Windows or Linux
- **Network:** [Tailscale](https://tailscale.com/) installed on both PC and phone
- **Phone:** Android 8+

## Quick Start

### 1. Daemon (PC)

```bash
npx @dinko_abdic/claude-code-remote
```

Or install globally:

```bash
npm install -g @dinko_abdic/claude-code-remote
claude-code-remote
```

Or run from source:

```bash
cd daemon
npm install
npm start
```

On first run, the daemon generates an auth token and prints a QR code to the terminal. The daemon listens on port **8485** — locally and on your Tailscale IP.

You can also run it with PM2 for persistence:

```bash
npm run pm2:start   # start as background service
npm run pm2:logs    # view logs
npm run pm2:stop    # stop
```

### 2. App (Android)

Download the APK from [GitHub Releases](../../releases) and install it (it's a debug build, so you may need to enable developer settings on your phone to be able to install the apk). Open the app, scan the QR code shown by the daemon, and you're connected.

## Security Model

This project **does not implement TLS** directly. Instead, it relies on Tailscale's WireGuard encryption for all traffic between your phone and PC:

- **Transport encryption:** Handled by Tailscale (WireGuard). The daemon only binds to `127.0.0.1` and your Tailscale IP — it is not exposed to the public internet.
- **Authentication:** A random 32-byte hex token is generated on first run and stored in `%APPDATA%/claude-code-remote/config.json`. Every API and WebSocket request must include this token via `Authorization: Bearer` header.
- **Localhost bypass:** Requests from `127.0.0.1` / `::1` skip auth since they're already on the machine.

**Do not expose the daemon port to the public internet.** It is designed to run behind Tailscale only.

## Building from Source

### Daemon

```bash
cd daemon
npm install
npm start
```

### App

The app is built with Expo (React Native). Due to an Android NDK issue with non-ASCII paths, the build uses a clean working directory:

```bash
# Copy app to a clean path
cp -r app /c/ccr-build
cd /c/ccr-build

npm install
npx expo prebuild

# Set environment
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"

# Build release APK
cd android && ./gradlew assembleRelease
```

The APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

## Configuration

Daemon config lives at `%APPDATA%/claude-code-remote/config.json`:

| Field | Default | Description |
|---|---|---|
| `token` | auto-generated | Auth token (32-byte hex) |
| `port` | `8485` | Daemon listen port |
| `shell` | auto-detect | Shell to spawn (e.g. `bash`, `powershell`) |
| `defaultCwd` | home dir | Default working directory for new sessions |
| `sessionKeepAliveMinutes` | `30` | How long idle sessions stay alive |

## Known Limitations

- **Android only** — no iOS app (yet)
- **No TLS** — relies entirely on Tailscale; do not use on untrusted networks without it
- **Single user** — designed for personal use, not multi-tenant
- **Windows build quirk** — non-ASCII characters in the project path break the Android NDK CMake build (use the copy-to-clean-path workaround above)

## License

[MIT](LICENSE)
