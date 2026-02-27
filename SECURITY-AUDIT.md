# Security Audit Report — Claude Code Remote

**Date:** 2026-02-23
**Scope:** Full codebase review (daemon + Android app)
**Auditor:** Claude Code

---

## Executive Summary

Claude Code Remote is an Android app + PC daemon for controlling Claude Code remotely via WebSocket over Tailscale. The architecture relies heavily on Tailscale's WireGuard encryption as the primary security boundary. While several good practices exist (timing-safe token comparison, sandbox path validation), there are **significant findings** across authentication, transport, storage, and access control that should be addressed.

**Finding counts:** 5 Critical, 5 High, 6 Medium, 4 Low
**Remediated:** C1, C2, C5, H2, H5 (2026-02-23)

---

## Architecture Overview

```
┌──────────────┐    Tailscale (WireGuard)    ┌──────────────┐
│  Android App │ ◄──────── ws:// ──────────► │  PC Daemon   │
│  (Expo/RN)   │    100.x.x.x:8485          │  (Node.js)   │
│              │                              │  node-pty     │
│  AsyncStorage│                              │  config.json  │
└──────────────┘                              └──────────────┘
```

- Auth: single shared token (64-char hex, generated on first run)
- Transport: plain `ws://` over Tailscale's encrypted tunnel
- Terminal: `node-pty` spawns real shell sessions (pwsh/cmd)
- Dashboard: auth-gated for remote access, QR code only shown on localhost

---

## Remediation Log

| Date | Findings Fixed | Changes |
|------|---------------|---------|
| 2026-02-23 | C1, C2, C5, H2, H5 | Bound daemon to localhost + Tailscale IP only (two HTTP servers). Added auth gate at top of request handler — localhost passes without token, remote requires `authenticate()`. QR code only shown on localhost dashboard. Removed token from console logs. Eliminated duplicated inline auth code in favor of shared `authenticate()`. |

**Files changed:**
- `daemon/src/index.js` — Two-server bind (`127.0.0.1` + Tailscale IP), `isLocalRequest()` helper, auth gate, refactored inline auth
- `daemon/src/dashboard.js` — Added `showQr` parameter (false hides QR code with message)
- `daemon/src/config.js` — Replaced token log with "see config file" message

---

## Findings

### CRITICAL

#### C1 — ~~Unauthenticated Dashboard Exposes Auth Token via QR Code~~ FIXED

| | |
|---|---|
| **File** | `daemon/src/dashboard.js:11-17`, `daemon/src/index.js:23-38` |
| **OWASP** | A04:2021 — Insecure Design |

The dashboard at `/` and `/dashboard` is served **without any authentication**. It embeds the full auth token inside a QR code:

```js
// dashboard.js:11-17
const payload = JSON.stringify({
  type: 'ccr',
  host: tailscaleStatus.ip,
  port: config.port,
  token: config.token,   // ← full credential in unauthenticated page
});
```

**Impact:** Anyone with network access to the daemon (local or Tailscale) can open the dashboard and extract the token. This grants full terminal access to the host machine.

**Remediation:** Remote requests to the dashboard now require token auth. QR code is only rendered when accessed from localhost (`showQr` parameter in `generateDashboard()`). Remote dashboard shows "Open dashboard from your PC (localhost) to see the setup QR code".

---

#### C2 — ~~Unauthenticated HTTP Endpoints Allow File System Browsing and Modification~~ FIXED

| | |
|---|---|
| **File** | `daemon/src/index.js:41-201` |
| **OWASP** | A01:2021 — Broken Access Control |

Multiple HTTP endpoints have **no authentication at all**:

| Endpoint | Method | Risk |
|----------|--------|------|
| `/api/status` | GET | Leaks Tailscale IP, session count, connected device names |
| `/api/settings` | GET | Leaks default working directory |
| `/api/settings` | POST | **Allows changing daemon configuration** |
| `/api/browse` | GET | **Browses arbitrary directories on the host** |
| `/api/mkdir` | POST | **Creates arbitrary directories on the host** |
| `/api/pick-directory` | POST | Triggers a system folder picker dialog |

Only `/api/sessions` (GET/DELETE) checks the auth token. All other endpoints are wide open.

**Impact:** Any process or user that can reach port 8485 can browse the entire filesystem, create directories, and change daemon settings — without knowing the token.

**Remediation:** Added a single auth gate at the top of the shared `requestHandler`. `isLocalRequest()` checks if the request comes from `127.0.0.1`/`::1`/`::ffff:127.0.0.1` — localhost passes without token, all remote requests require `authenticate(req, config.token)` or get a 401. This protects every endpoint with one check.

---

#### C3 — Token Transmitted in URL Query Parameters

| | |
|---|---|
| **File** | `app/src/ws/WebSocketClient.ts:44`, `app/src/ws/api.ts:18,41` |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

The auth token is sent as a URL query parameter in every WebSocket connection and HTTP API call:

```typescript
// WebSocketClient.ts:44
let url = `ws://${host}:${port}?token=${encodeURIComponent(token)}`;

// api.ts:18
`http://${host}:${port}/api/sessions?token=${encodeURIComponent(token)}`
```

**Impact:** Tokens in URLs are logged by proxies, visible in server access logs, cached in memory, and may leak via Referer headers. The auth.js comment on line 25 acknowledges this is a React Native limitation, but no mitigation is in place.

**Recommendation:** For HTTP API calls, switch to `Authorization: Bearer <token>` headers (already supported by the daemon). For WebSocket, consider a post-connect auth handshake message instead of query params.

---

#### C4 — No TLS at Application Layer (ws:// not wss://)

| | |
|---|---|
| **File** | `app/src/ws/WebSocketClient.ts:44`, `daemon/src/index.js:1,399` |
| **OWASP** | A02:2021 — Cryptographic Failures |

All connections use unencrypted `ws://` and `http://`. The daemon creates a plain `http.createServer()` with no TLS:

```js
// index.js:1
const http = require('http');
// index.js:399
server.listen(port, '0.0.0.0', () => { ... });
```

The project relies entirely on Tailscale's WireGuard tunnel for encryption.

**Impact:** If Tailscale is misconfigured, down, or bypassed (e.g., accessing via LAN IP instead of Tailscale IP), all traffic including the auth token flows in plaintext. Defense-in-depth is absent.

**Recommendation:** For a personal tool over Tailscale, this is an acceptable trade-off if documented. For any broader deployment, add TLS with self-signed certs or use Tailscale's built-in HTTPS cert provisioning (`tailscale cert`).

---

#### C5 — ~~Daemon Binds to 0.0.0.0 (All Network Interfaces)~~ FIXED

| | |
|---|---|
| **File** | `daemon/src/index.js:399` |
| **OWASP** | A05:2021 — Security Misconfiguration |

```js
server.listen(port, '0.0.0.0', () => { ... });
```

The daemon listens on **every network interface** — not just Tailscale's. This means it's reachable on the LAN IP, WiFi, etc.

**Impact:** Combined with C2 (unauthenticated endpoints), any device on the same local network can browse the filesystem and modify settings without any authentication.

**Remediation:** Replaced single `0.0.0.0` server with two servers: `localServer` binds to `127.0.0.1:port` (always), `tsServer` binds to `{tailscaleIP}:port` (only if Tailscale detected). LAN IPs are no longer listening.

---

### HIGH

#### H1 — Config File Created with Default Permissions

| | |
|---|---|
| **File** | `daemon/src/config.js:47` |
| **OWASP** | A02:2021 — Cryptographic Failures |

```js
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
```

The config file containing the auth token is written with Node.js defaults. On Windows, APPDATA is typically user-scoped, but no explicit permission restriction is applied.

**Recommendation:** On Linux/macOS, explicitly set mode `0o600`. On Windows, verify APPDATA ACLs are user-only.

---

#### H2 — ~~Token Logged to Console on First Run~~ FIXED

| | |
|---|---|
| **File** | `daemon/src/config.js:49` |

```js
logger.info(`Auth token: ${config.token}`);
```

The full 64-character auth token was written to stdout on first run. If the daemon runs under a process manager (pm2, systemd), this ends up in persistent log files.

**Remediation:** Replaced with `logger.info('Auth token generated — see config file')`. Token no longer appears in logs.

---

#### H3 — Auth Token Stored in Plaintext AsyncStorage on Android

| | |
|---|---|
| **File** | `app/src/store/useConnectionStore.ts:49-52` |
| **OWASP** | A02:2021 — Cryptographic Failures |

```typescript
{
  name: 'connection-store',
  storage: createJSONStorage(() => asyncStorage),
}
```

The auth token is persisted via Zustand + AsyncStorage, which on Android is backed by unencrypted SharedPreferences (an XML file on disk).

**Impact:** On a rooted device or via ADB backup, the token is trivially extractable.

**Recommendation:** Use `expo-secure-store` or Android's EncryptedSharedPreferences for the token specifically. Other settings (host, port, font size) can stay in AsyncStorage.

---

#### H4 — No Rate Limiting on Authentication Attempts

| | |
|---|---|
| **File** | `daemon/src/auth.js:39`, `daemon/src/index.js:268-279` |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

Failed auth attempts are logged but not rate-limited:

```js
logger.warn(`Auth failed from ${req.socket.remoteAddress}`);
```

**Impact:** An attacker on the Tailscale network (or local network, given C5) can brute-force the token. The 32-byte random token makes this impractical in theory, but rate limiting is still good practice.

**Recommendation:** Add per-IP rate limiting (e.g., max 10 failed attempts per minute, then 5-minute lockout).

---

#### H5 — ~~Duplicated Auth Logic Across HTTP Endpoints~~ FIXED

| | |
|---|---|
| **File** | `daemon/src/index.js:206-225, 234-253` (old) |

The token verification for `/api/sessions` was implemented inline twice, duplicating the logic from `auth.js`.

**Remediation:** Both inline auth blocks removed. All endpoints are now protected by the single auth gate at the top of `requestHandler`, which uses the shared `authenticate()` function from `auth.js`.

---

### MEDIUM

#### M1 — XTerm WebView Loads Scripts from CDN Without Integrity Checks

| | |
|---|---|
| **File** | `app/src/components/XTermView.tsx:24,34-36` |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |

```html
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
```

No Subresource Integrity (SRI) hashes. If the CDN is compromised, arbitrary JS runs inside the WebView that has access to terminal I/O.

**Recommendation:** Add `integrity` and `crossorigin` attributes, or bundle the scripts locally.

---

#### M2 — WebView originWhitelist Set to Wildcard

| | |
|---|---|
| **File** | `app/src/components/XTermView.tsx:218` |

```tsx
originWhitelist={['*']}
```

This allows the WebView to navigate to any origin if navigation is triggered.

**Recommendation:** Restrict to `['about:*']` or the specific origins needed, and add `onShouldStartLoadWithRequest` to block external navigation.

---

#### M3 — No Content Security Policy in WebView HTML

| | |
|---|---|
| **File** | `app/src/components/XTermView.tsx:19-167` |

The dynamically generated HTML has no CSP `<meta>` tag. Combined with the CDN script loading, this means any injected script can execute freely.

**Recommendation:** Add a CSP meta tag restricting `script-src` to the specific CDN URLs (or `'self'` if bundled locally).

---

#### M4 — No Message Size Limits on WebSocket or HTTP Body

| | |
|---|---|
| **File** | `daemon/src/index.js:347-354`, `daemon/src/index.js:150-151` |

```js
// WebSocket
msg = JSON.parse(raw.toString());  // No size check

// HTTP
req.on('data', (chunk) => { body += chunk; });  // Unbounded accumulation
```

**Impact:** A malicious client could send extremely large messages to exhaust daemon memory.

**Recommendation:** Set `maxPayload` on the WebSocketServer and limit HTTP body size (e.g., 1MB max).

---

#### M5 — Session Reconnection Requires No Re-authentication

| | |
|---|---|
| **File** | `daemon/src/index.js:311-316` |

```js
if (requestedId && tm.getSession(requestedId)) {
  sessionId = requestedId;
  tm.attachWebSocket(sessionId, ws);
}
```

While the WebSocket upgrade itself requires auth (line 269), a successfully authenticated client can attach to **any existing session** by providing its UUID — including sessions created by other devices.

**Impact:** If two devices connect with the same token, either can hijack the other's session.

**Recommendation:** Track which token/device created each session, and only allow reconnection from the same device.

---

#### M6 — PTY Spawned with Full Parent Environment

| | |
|---|---|
| **File** | `daemon/src/terminal-manager.js:23` |

```js
pty.spawn(shell, [], {
  env: process.env,  // Full daemon environment passed to PTY
});
```

**Impact:** Any environment variables set for the daemon process (potentially including secrets, API keys, etc.) are inherited by the shell session and visible via `env` / `set` commands.

**Recommendation:** Filter `process.env` to pass only necessary variables (PATH, HOME, TERM, etc.).

---

### LOW

#### L1 — Sandbox Disabled by Default

| | |
|---|---|
| **File** | `daemon/src/config.js:41`, `daemon/src/sandbox.js:11-13` |

```js
sandboxRoot: null,  // config.js:41

if (!sandboxRoot) {
  return path.resolve(requestedPath);  // sandbox.js — allows anything
}
```

When `sandboxRoot` is null (default), all path-based operations (`/api/browse`, `/api/mkdir`, PTY cwd) are unrestricted.

**Note:** This is a design choice — the tool is meant to provide full system access. But it should be documented as a conscious decision.

---

#### L2 — `execSync` Used for Tailscale Detection

| | |
|---|---|
| **File** | `daemon/src/tailscale.js:15-21,32` |

```js
tryExec(`"${bin}" status --json`);
```

The `bin` variable comes from a hardcoded array, not user input, so injection risk is minimal. However, `execSync` blocks the event loop for up to 5 seconds per attempt.

**Recommendation:** Use `execFile` (async) instead to avoid blocking.

---

#### L3 — `wmic` Used for Drive Listing (Deprecated)

| | |
|---|---|
| **File** | `daemon/src/index.js:87` |

```js
execSync('wmic logicaldisk get name,volumename', { encoding: 'utf-8' });
```

`wmic` is deprecated in modern Windows. It also uses `execSync` which blocks.

**Recommendation:** Switch to PowerShell `Get-Volume` or `Get-PSDrive` via `execFile`.

---

#### L4 — Token Field Not Masked in Settings UI

| | |
|---|---|
| **File** | `app/src/screens/SettingsScreen.tsx:120` |

```tsx
secureTextEntry={false}
```

The token is displayed in plaintext in the settings screen.

**Recommendation:** Default to `secureTextEntry={true}` with a toggle to reveal.

---

## Positive Findings

These are good security practices already in place:

1. **Timing-safe token comparison** (`auth.js:19,31`, `index.js:212,218`) — uses `crypto.timingSafeEqual` to prevent timing attacks
2. **Strong token generation** (`config.js:39`) — `crypto.randomBytes(32)` produces a 256-bit token
3. **Path traversal protection** (`sandbox.js:16-34`) — validates resolved paths against sandbox root with UNC path blocking on Windows
4. **Session auto-cleanup** (`terminal-manager.js:161-171`) — abandoned sessions are destroyed after configurable timeout (default 30 min)
5. **WebSocket noServer mode** (`index.js:266-279`) — auth check happens before WebSocket handshake completes
6. **HTML escaping in dashboard** (`dashboard.js:3-5`) — `escapeHtml()` used for dynamic content
7. **Input batching** (`XTermView.tsx:86-118`) — reduces bridge overhead, no eval-style execution

---

## Risk Matrix

| ID | Finding | Severity | Exploitability | Fix Effort |
|----|---------|----------|---------------|------------|
| C1 | ~~Dashboard exposes token without auth~~ | Critical | ~~Trivial~~ | **FIXED** |
| C2 | ~~Unauthenticated file system endpoints~~ | Critical | ~~Trivial~~ | **FIXED** |
| C3 | Token in URL query parameters | Critical | Low (needs MITM) | Medium |
| C4 | No application-layer TLS | Critical | Low (needs network) | High |
| C5 | ~~Daemon binds to 0.0.0.0~~ | Critical | ~~Easy (same LAN)~~ | **FIXED** |
| H1 | Config file default permissions | High | Local access needed | Low |
| H2 | ~~Token logged to console~~ | High | ~~Log access needed~~ | **FIXED** |
| H3 | Token in plaintext AsyncStorage | High | Physical/root access | Medium |
| H4 | No auth rate limiting | High | Network access | Medium |
| H5 | ~~Duplicated auth logic~~ | High | ~~Indirect risk~~ | **FIXED** |
| M1 | CDN scripts without SRI | Medium | CDN compromise | Low |
| M2 | WebView origin wildcard | Medium | Chained exploit | Trivial |
| M3 | No CSP in WebView | Medium | Chained exploit | Low |
| M4 | No message size limits | Medium | Network access | Low |
| M5 | Session reconnect without device check | Medium | Needs token | Medium |
| M6 | Full env inherited by PTY | Medium | Needs session | Low |
| L1 | Sandbox disabled by default | Low | By design | N/A |
| L2 | execSync blocks event loop | Low | Performance only | Low |
| L3 | Deprecated wmic usage | Low | Compat only | Low |
| L4 | Token visible in settings UI | Low | Physical access | Trivial |

---

## Recommended Priority Actions

### Immediate (before any shared use) — DONE

1. ~~**Add auth to all HTTP endpoints**~~ — Auth gate added at top of request handler. Localhost passes, remote requires token. **(Fixed 2026-02-23)**
2. ~~**Bind daemon to Tailscale IP + localhost only**~~ — Two servers: `127.0.0.1` + Tailscale IP. **(Fixed 2026-02-23)**
3. ~~**Remove token from logs**~~ — Replaced with "see config file" message. **(Fixed 2026-02-23)**

### Short-term

4. ~~**Protect dashboard QR code**~~ — QR only shown on localhost; remote sees "open from PC" message. **(Fixed 2026-02-23)**
5. **Move token to Authorization header** for HTTP API calls (already supported by daemon).
6. **Add `maxPayload`** to WebSocketServer (e.g., 1MB).
7. **Bundle xterm.js locally** or add SRI hashes.
8. **Filter `process.env`** before passing to PTY.

### Longer-term

9. **Add rate limiting** for failed auth attempts.
10. **Use expo-secure-store** for token storage on Android.
11. **Consider TLS** via Tailscale's `tailscale cert` for defense-in-depth.
12. **Add per-device session binding** to prevent cross-device session hijacking.

---

## Threat Model Notes

This tool is designed for **personal use over a Tailscale network**. The threat model assumes:

- The Tailscale network is trusted (only your devices)
- Physical access to both devices is controlled
- The daemon runs on a personal workstation

~~Under this model, the Critical findings (C1, C2, C5) are the most urgent because they **break the assumption** — the daemon is reachable from the local network without Tailscale, and unauthenticated endpoints allow filesystem access from any device on that network.~~

**Update (2026-02-23):** C1, C2, and C5 have been fixed. The daemon now only listens on localhost and Tailscale, all remote requests require auth, and the QR code is localhost-only. The remaining open critical findings (C3, C4) require network-level access to exploit and are mitigated by Tailscale's WireGuard encryption.

If the tool will ever be used on shared Tailscale networks or by multiple users, all remaining High and Critical findings should be addressed first.
