# AI Humanizer

A one-page web app that turns AI-generated text into natural, human-sounding writing. Paste text directly or upload a file (`.txt`, `.md`, `.pdf`, `.docx`) and the tool humanizes it.

Humanization runs **entirely locally** — no third-party API, no API key. A self-optimizing feedback loop learns from your edits over time.

- **Frontend:** React + Vite
- **Backend:** Node.js + Express with a local NLP humanization engine (`compromise`, `natural`, `string-similarity`)

## Project structure

```
aihumanizer/
├─ server/                 Express API + local engine
│  ├─ index.js             API routes
│  ├─ textExtractor.js     File text extraction
│  ├─ humanizer/
│  │  ├─ engine.js         Pipeline + meaning-preservation guard
│  │  ├─ transforms.js     Phrase swap, contractions, burstiness
│  │  ├─ phraseMap.js      AI-cliché → natural replacements
│  │  └─ feedback.js       Feedback store + self-optimizing profile
│  └─ data/                feedback.json + profile.json (auto-created)
├─ client/                 React single-page UI (Vite)
│  └─ src/
└─ package.json            Convenience scripts to run both apps
```

## Prerequisites

- Node.js 18+ (built and tested on Node 22)

## Setup

1. Install dependencies for the root, server, and client:

```bash
npm run install:all
```

2. (Optional) Configure the backend. No API key is required. To change defaults, copy the example:

```bash
cd server
cp .env.example .env
```

```
PORT=5000
HUMANIZER_INTENSITY=balanced
```

## Running

Start both the backend and frontend together from the project root:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

The Vite dev server proxies `/api/*` requests to the backend, so you only need to open the frontend URL.

To run them separately:

```bash
npm run start:server   # backend on :5000
npm run start:client   # frontend on :5173
```

## How it works

1. You paste text or upload a file in the UI.
2. The React app sends the text (or file) to the Node backend.
3. For files, the backend extracts plain text (`.docx` via `mammoth`, `.pdf` via `pdf-parse`, `.txt`/`.md` read directly).
4. The local engine processes the text sentence-by-sentence:
   - Replaces AI-cliché phrases with natural equivalents (`it is imperative that` → …, `utilize` → `use`).
   - Injects contractions, varies sentence length (burstiness), trims filler.
   - A **meaning-preservation guard** rejects any change that would drop a number or real content word.
5. The humanized text is returned and shown in an editable panel.

### Intensity

- **Light** — phrase cleanup + contractions only (safest).
- **Balanced** (default) — adds filler trimming and sentence-length variation.
- **Strong** — more aggressive filler removal and splitting.

### Self-improving feedback loop

The output panel is editable. When you edit it and click **Save & improve**, your edits are sent to `POST /api/feedback`. The engine checks which transforms you kept vs. reverted and updates weights in `data/profile.json`, so future rewrites bias toward what you actually keep. Inspect the learned profile at `GET /api/profile`.

## Production build (Linux server)

Create an upload-ready package:

```bash
npm run build:deploy
```

This generates:

- `deploy/` — full production app (Node server + built React UI in `dist/`)
- `aihumanizer-linux.zip` — zip this folder and upload to your Linux server

See **[DEPLOY-LINUX.md](DEPLOY-LINUX.md)** for cPanel, PM2, and Nginx setup steps.

## Notes

- Max input length is 50,000 characters.
- Uploaded files are processed in memory and never written to disk.
- All processing is local — no text ever leaves your server.
- Honest expectation: this improves naturalness and removes obvious AI tells while preserving meaning. It is not guaranteed to defeat AI detectors (only a strong local LLM gets close, which needs a VPS/GPU).
