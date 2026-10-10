# 🛡️ Veyra AI — Architecture, Security Audit & Production Deployment Guide

**Veyra AI** is a privacy-first AI research workspace and chatbot designed for researchers, students, and professionals who require sovereign control over their conversation data, notes, and documents.

This repository pairs a zero-telemetry, client-side React workspace with an optional, stateless Node.js backend proxy supporting **Google Gemini** and **Groq Cloud AI** inference, alongside persistent disk and MongoDB metadata storage for workspace files and folders.

---

## 🏛️ System Architecture

Veyra AI is partitioned into two distinct security domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER SANDBOX                          │
│                                                                        │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   UI & State Engine    │         │      Local Data Storage       │  │
│  │  React 19 + TypeScript │ ◄─────► │  • IndexedDB (Dexie v4)       │  │
│  │  Tailwind CSS v4       │         │  • AES-GCM 256-bit Encryption │  │
│  └───────────┬────────────┘         │  • Ephemeral RAM Session Mode │  │
│              │                      └───────────────────────────────┘  │
│              │                                                         │
│              ▼ (Only if Cloud AI selected AND consent explicitly given) │
│       TLS (HTTPS) POST /api/chat                                       │
│       (Prompt + max 6 recent messages in active thread)                │
└──────────────┼─────────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  STATELESS BACKEND API PROXY (Node.js)                 │
│                                                                        │
│  • Express 5 with Content-Security-Policy & Security Headers           │
│  • Server-side GEMINI_API_KEY / GROQ_API_KEY (never leaked to client)  │
│  • Strict Consent Enforcement (HTTP 403 on refusal)                   │
│  • Anti-DoS 100 KB JSON limit & in-memory IP Rate Limiting             │
│  • Zero server-side persistence of chat logs or prompts                │
│  • Persistent File & Folder storage (disk `uploads/` + MongoDB)        │
│                                                                        │
│       TLS (HTTPS) Gemini / Groq Cloud API                              │
└──────────────┼─────────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    CLOUD AI PROVIDER (Google / Groq)                   │
│  • Evaluates inference prompt (e.g. gemini-3.5-flash)                   │
│  • Governed by AI Provider Terms of Service & Privacy Policy           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Boundaries & Privacy Flow Matrix

| Data Asset | Stored In Browser | Sent to Backend Proxy | Sent to External AI Provider | Security Controls |
| :--- | :---: | :---: | :---: | :--- |
| **Chat Conversations** | **Yes** (IndexedDB / RAM) | **Only active thread context** | **Only active thread context** | AES-GCM 256 authenticated encryption; bounded to &le; 6 messages |
| **Research Notes** | **Yes** (IndexedDB / RAM) | **✕ Never (0 B)** | **✕ Never (0 B)** | Encrypted locally; 100% device-isolated |
| **Workspace Files & Folders** | **Yes** (IndexedDB cache) | **Yes** (persistent disk storage) | **✕ Never (0 B)** (unless attached) | Stored in `uploads/` on disk; zero-byte files accepted; path-traversal protected |
| **Master Passphrase / Key**| **RAM Only** (while unlocked) | **✕ Never (0 B)** | **✕ Never (0 B)** | PBKDF2 100,000 iterations; non-extractable CryptoKey; purged on lock |
| **Analytics & Trackers** | **✕ None** | **✕ None** | **✕ None** | Zero cookies, zero telemetry scripts |

---

## ⚙️ Environment Variables & Secret Management

All sensitive secrets are kept strictly server-side. The client bundle contains **0 API keys**.

### Server-Side Variables (`.env` or Container Environment)

| Variable | Required? | Default | Description |
| :--- | :---: | :---: | :--- |
| `GEMINI_API_KEY` | Recommended | *None* | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/). Supports standard and `AQ...` keys. |
| `GEMINI_MODEL` | Optional | `gemini-3.5-flash` | Supported Google Gemini model identifier (with automated fallback cascade). |
| `GROQ_API_KEY` | Optional | *None* | Groq Cloud API key from [Groq Console](https://console.groq.com/keys) as secondary provider. |
| `GROQ_MODEL` | Optional | `openai/gpt-oss-120b` | Supported Groq model identifier. |
| `PORT` | Optional | `3001` | Port for the Express server to listen on. |
| `NODE_ENV` | Optional | `development` | Set to `production` in production environments to enable HSTS and optimizations. |
| `MONGODB_URI` | Optional | `mongodb://127.0.0.1:27017/privy_ai` | MongoDB connection URI for persistent metadata (falls back gracefully to disk storage). |
| `UPLOAD_DIR` | Optional | `./uploads` | Persistent directory on disk for uploaded files. |
| `ALLOWED_ORIGINS`| Optional | `*` | Comma-separated list of allowed CORS origins (e.g. `https://privy.yourdomain.com`). |

> [!CAUTION]
> Never prefix secrets with `VITE_`. Any variable starting with `VITE_` is automatically baked into the client-side JavaScript bundle during build and readable by anyone visiting the site.

---

## 🔒 Security Headers & Content Security Policy (CSP)

The backend proxy serves the following production security headers on all responses:

- **Content-Security-Policy (CSP)**:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  ```
- **Strict-Transport-Security (HSTS)**:
  `max-age=63072000; includeSubDomains; preload` (enforced when `NODE_ENV=production`).
- **X-Content-Type-Options**: `nosniff`
- **X-Frame-Options**: `DENY` (prevents clickjacking)
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: `camera=(), microphone=(), geolocation=(), payment=()`
- **X-Powered-By**: Disabled (`app.disable('x-powered-by')`) to prevent server technology fingerprinting.

---

## 📜 Logging & Retention Policy

1. **Zero Prompt / Response Logging**: The Express server never logs prompt contents, completion text, or API keys to `stdout` or log files.
2. **Reverse Proxy Log Anonymization**: The included `deployment/nginx.conf` and `deployment/Caddyfile` templates sanitize URL parameters and do not log request or response bodies.
3. **Zero Telemetry**: No third-party analytics SDKs, Google Analytics, or error-tracking telemetry are installed.

---

## 🛠️ Installation, Development & Testing

### 1. Prerequisites
- Node.js 20+ (Node.js 22+ recommended)
- npm 10+

### 2. Installation
```bash
npm install
```

### 3. Configure Backend Secrets
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
# Edit .env and insert your GEMINI_API_KEY and/or GROQ_API_KEY
```

### 4. Run Development Servers
- Start frontend dev server (Vite):
  ```bash
  npm run dev
  # Accessible at http://localhost:5173
  ```
- Start backend API proxy:
  ```bash
  npm run server
  # Accessible at http://localhost:3001
  ```

### 5. Run the Automated Test Suite
Veyra AI includes 11 comprehensive automated test suites covering over 75 assertions:
```bash
npm test
```

Test suites include:
- `tests/cryptoAndSearch.test.mjs`: Web Crypto primitives & full-text fuzzy search
- `tests/projectManagement.test.mjs`: Project & conversation hierarchy and cascade deletion
- `tests/dexiePersistence.test.mjs`: IndexedDB CRUD, session-only isolation & schema migration
- `tests/cryptoPersistence.test.mjs`: AES-GCM envelope encryption, IV generation & tamper detection
- `tests/geminiIntegration.test.mjs`: Gemini API gateway, model cascade & consent boundary
- `tests/notesAndFiles.test.mjs`: Multi-note autosave, file isolation & anti-XSS validation
- `tests/privacyCenter.test.mjs`: Sovereign migrations, backup export & panic wipe
- `tests/qaSecurityAudit.test.mjs`: Live HTTP security audit & static bundle inspection
- `tests/privacyArchitecture.test.mjs`: End-to-end privacy architecture guarantees
- `tests/persistentStorage.test.mjs`: Disk storage, zero-byte uploads, directory trees & streaming
- `tests/productionReadiness.test.mjs`: Production bundle secret scanning, CSP, rate-limits & anti-DoS

---

## 🚀 Production Build & Deployment

### Reproducible Build
Compile the client-side bundle:
```bash
npm run build
```
This produces optimized production assets in `dist/`.

---

### Deployment Options

#### Option A: Unified Container / Single-Service (Recommended)
Deploy Veyra AI as a sovereign Docker container on **Railway**, **Render**, **Fly.io**, or an **Ubuntu VPS**:

```bash
# Build production Docker image
docker build -f deployment/Dockerfile -t privy-ai:latest .

# Run container with secret environment variables and persistent upload volume
docker run -d \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY="your-gemini-api-key" \
  -e ALLOWED_ORIGINS="https://privy.yourdomain.com" \
  -v privy_uploads:/app/uploads \
  --name privy-ai privy-ai:latest
```

In this setup:
- The Express server serves both the static frontend (`dist/`) and the `/api` endpoints on port 3001.
- Place a reverse proxy (Nginx or Caddy) in front to terminate HTTPS (TLS).
- Templates provided in `deployment/nginx.conf` and `deployment/Caddyfile`.

#### Option B: Split Architecture (Static CDN + Backend Proxy)
- **Frontend**: Deploy `dist/` to a static CDN (Cloudflare Pages, Vercel, Netlify).
- **Backend**: Deploy `server/` to a Node.js container service (Railway, Render, Fly.io).
- Configure `ALLOWED_ORIGINS` in the backend environment to match your frontend domain.

---

## 🔌 Offline & Fault Tolerance Behavior

| Scenario | Application Behavior |
| :--- | :--- |
| **No Internet Connection** | Fully operational using **Local Mock Engine**. IndexedDB storage, notes editing, file viewing, and cryptographic operations work 100% offline. |
| **Backend Server Offline** | Header displays amber "Server Offline" badge. Chat interface presents an explicit service notice and offers a one-click toggle to switch to offline Local Mock mode. |
| **API Key Missing / Revoked** | Returns sanitized `HTTP 503` notice prompting administrator to configure `.env`. No stack traces or credentials exposed. |
| **Cloud AI Rate Limit (429)** | Displays clear rate limit notification without crashing or blocking local workspace features. |

---

## ⚠️ Realistic Threat Model & Remaining Risks

1. **No Cloud Sync for Local Notes**: Unencrypted local workspace data lives strictly in your browser. Clearing browser site data or origin cache will delete local data unless regular **Export JSON** backups are maintained.
2. **Zero Password Recovery**: The vault master passphrase is never stored on any server. If you lose your passphrase, encrypted data cannot be decrypted by anyone.
3. **Endpoint Malware Risk**: Client-side encryption protects data at rest against physical device theft and raw database extraction. It cannot protect against spyware, keyloggers, or malicious browser extensions with `<all_urls>` DOM access while the workspace is unlocked.
4. **Third-Party AI Retention**: Prompts submitted with user consent travel over TLS to Google or Groq and are subject to their respective Cloud Terms of Service.
5. **Disk Storage Permissions**: Files in `uploads/` on the server host require proper OS file-system permissions (e.g., readable/writable only by the application process user).

---

## ✅ Pre-Deployment Checklist

Before deploying to production, verify each of the following:

- [ ] `npm test` passes cleanly across all 11 test suites.
- [ ] `npm run build` compiles with 0 TypeScript and bundling errors.
- [ ] `GEMINI_API_KEY` (and/or `GROQ_API_KEY`) is configured only as a server-side environment variable.
- [ ] Real `.env` file is excluded from Git repository (`.gitignore` verified).
- [ ] Production domain is secured with HTTPS (valid TLS certificate via Let's Encrypt).
- [ ] Content-Security-Policy (CSP) and security headers are active on the production reverse proxy.
- [ ] Reverse-proxy access logs are configured to omit request bodies and query parameters.
- [ ] `ALLOWED_ORIGINS` is configured with your production domain URL.
- [ ] Volume persistence is mounted for the `uploads/` directory if file persistence across container re-deploys is required.
