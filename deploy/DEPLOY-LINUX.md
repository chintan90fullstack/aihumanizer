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

**Important:** install dependencies on the Linux server (do not upload `node_modules` from Windows):

```bash
cd ~/aihumanizer
rm -rf node_modules package-lock.json
npm install --omit=dev
```

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set your values:

```env
PORT=5000
HUMANIZER_INTENSITY=balanced
```

> Use a different `PORT` if another Node app on the same server already uses 5000.
> No API key is needed — humanization runs fully locally on your server.

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
{"status":"ok","engine":"local","profile":{ ... }}
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
| `Cannot find module` | Run `npm install --omit=dev` on the Linux server (don't upload Windows `node_modules`). |
| Blank page | Ensure `dist/` exists and `index.js` is the startup file. |
| Port in use | Change `PORT` in `.env` to a free port. |
| 502 from proxy | Confirm Node app is running: `pm2 status` or cPanel app status. |
| Feedback not saving | Ensure the app can write to the `data/` folder (it's created automatically). |

## Security & data notes

- Humanization runs entirely on your server — no third-party API, no API key.
- Uploaded files are processed in memory and not stored on disk.
- The feedback loop stores generations/edits in `data/feedback.json` and learned
  weights in `data/profile.json`. Both stay on your server. Delete them anytime
  to reset the engine's learning.
