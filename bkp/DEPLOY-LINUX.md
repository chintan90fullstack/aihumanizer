# Deploy AI Humanizer on Linux (cPanel / VPS)

This package is a **single Node.js app** that serves both the React UI and the API.

## Package contents

```
aihumanizer/
├── dist/              Built React frontend (static files)
├── index.js           Server entry point
├── app.js             Same as index.js (for cPanel Node selector)
├── textExtractor.js   File text extraction helper
├── package.json
├── package-lock.json
├── node_modules/      Production dependencies
├── .env.example       Environment variable template
├── tmp/               Temporary folder (optional)
└── DEPLOY-LINUX.md    This file
```

## 1. Upload and extract

1. Upload `aihumanizer-linux.zip` to your server.
2. Extract it into its own folder, for example:
   - `/home/youruser/aihumanizer`
   - or a subdomain folder like `/home/youruser/public_html/humanizer`

```bash
mkdir -p ~/aihumanizer
cd ~/aihumanizer
unzip ~/aihumanizer-linux.zip
```

If you upload without `node_modules` (smaller zip), install dependencies on the server:

```bash
cd ~/aihumanizer
npm install --omit=dev
```

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set your values:

```env
HUMANIZE_API_KEY=hmai_ak_your_key_here
HUMANIZE_API_BASE=https://thehumanizeai.pro/api
PORT=5000
```

> Use a different `PORT` if another Node app on the same server already uses 5000.

## 3. Start the app

### Option A: cPanel "Setup Node.js App"

1. Open **Setup Node.js App** in cPanel.
2. Create a new application (or edit an existing one in a separate folder).
3. Set:
   - **Application root**: path to this folder (e.g. `aihumanizer`)
   - **Application URL**: your subdomain or path
   - **Application startup file**: `index.js` or `app.js`
   - **Node.js version**: 18 or higher
4. Add environment variables from `.env` in the cPanel UI (recommended on shared hosting).
5. Click **Run NPM Install** if needed, then **Start App**.

### Option B: PM2 (VPS / dedicated server)

```bash
cd ~/aihumanizer
npm install -g pm2   # once
pm2 start index.js --name aihumanizer
pm2 save
pm2 startup
```

### Option C: Direct start (quick test)

```bash
cd ~/aihumanizer
node index.js
```

## 4. Reverse proxy (recommended)

If you use Nginx or Apache in front of Node, proxy to the app port:

**Nginx example**

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

Set `proxy_read_timeout` to at least **120s** because humanization can take 30–60 seconds on slow networks.

## 5. Verify

```bash
curl http://127.0.0.1:5000/api/health
```

Expected response:

```json
{"status":"ok","hasKey":true}
```

Open your site URL in a browser, paste text, and click **Humanize**.

## Running multiple Node apps on the same server

Each app needs its own folder and port:

| App        | Folder              | PORT |
|------------|---------------------|------|
| Existing   | `/path/to/other-app`| 3000 |
| AI Humanizer | `/path/to/aihumanizer` | 5001 |

Use a separate cPanel Node application or PM2 process per app.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `fetch failed` / timeout | API host may be slow; retries are built in. Increase proxy timeout to 120s. |
| `hasKey: false` | Set `HUMANIZE_API_KEY` in `.env` or cPanel env vars. |
| Blank page | Ensure `dist/` exists and `index.js` is the startup file. |
| Port in use | Change `PORT` in `.env` to a free port. |
| 502 from proxy | Confirm Node app is running: `pm2 status` or cPanel app status. |

## Security notes

- Never commit `.env` or expose your API key in the browser.
- The API key stays on the server only.
- Uploaded files are processed in memory and not stored on disk.
