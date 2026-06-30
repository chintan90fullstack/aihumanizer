import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Agent, setGlobalDispatcher } from "undici";
import { extractText } from "./textExtractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");
const isProduction = fs.existsSync(distPath);

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.HUMANIZE_API_KEY;
const API_BASE = process.env.HUMANIZE_API_BASE || "https://thehumanizeai.pro/api";

const MAX_CHARS = 50000; // Hard limit enforced by the Humanize AI Pro API.

// The Humanize AI Pro host can be slow to connect/respond on some networks
// (the TCP+TLS handshake alone can take ~15-20s here). Node's default fetch
// connect timeout is only 10s, so we raise the timeouts to avoid premature
// "fetch failed" errors. Humanization itself can take up to ~60s.
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60000 },
    headersTimeout: 120000,
    bodyTimeout: 120000,
  })
);

if (!isProduction) {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

// Accept a single uploaded file in memory (max 10 MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

if (!API_KEY) {
  console.warn(
    "[warn] HUMANIZE_API_KEY is not set. Copy .env.example to .env and add your key."
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Humanize AI Pro API and normalise success/error handling.
 * Connectivity to the API host can be flaky, so transient network errors
 * (connect timeouts, dropped sockets) are retried a few times before failing.
 */
async function humanizeText({ text, model, tone }) {
  const body = { text, model: model || "fast" };
  if (body.model === "humanoidx" && tone) body.tone = tone;

  const MAX_ATTEMPTS = 3;
  let lastNetworkError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${API_BASE}/v1/humanize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      // Network-level failure (e.g. connect timeout): retry with backoff.
      lastNetworkError = networkErr;
      console.warn(
        `[humanize] network error on attempt ${attempt}/${MAX_ATTEMPTS}: ${networkErr.message}`
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1500 * attempt);
        continue;
      }
      const err = new Error(
        "Could not reach the humanization service. Please check your connection and try again."
      );
      err.status = 502;
      throw err;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message =
        data.message || data.error || `Humanize API error (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.details = data;
      throw err;
    }

    return data;
  }

  // Should be unreachable, but guards against falling through the loop.
  throw lastNetworkError || new Error("Humanization request failed.");
}

/** Shared handler used by both the text and file endpoints. */
async function handleHumanize(text, model, tone, res) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return res.status(400).json({ error: "No text provided to humanize." });
  }
  if (trimmed.length > MAX_CHARS) {
    return res.status(400).json({
      error: `Text is too long (${trimmed.length} characters). The limit is ${MAX_CHARS}.`,
    });
  }

  try {
    const data = await humanizeText({ text: trimmed, model, tone });
    return res.json(data);
  } catch (err) {
    return res
      .status(err.status && err.status >= 400 ? err.status : 502)
      .json({ error: err.message, details: err.details });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", hasKey: Boolean(API_KEY) });
});

// Humanize raw text submitted as JSON.
app.post("/api/humanize", async (req, res) => {
  const { text, model, tone } = req.body || {};
  await handleHumanize(text, model, tone, res);
});

// Humanize text extracted from an uploaded file.
app.post("/api/humanize-file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  let text;
  try {
    text = await extractText(req.file);
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Could not read the uploaded file." });
  }

  const { model, tone } = req.body || {};
  await handleHumanize(text, model, tone, res);
});

// Extract plain text from an uploaded file without humanizing it.
// Used by the Upload button to populate the input panel.
app.post("/api/extract", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    const text = await extractText(req.file);
    return res.json({ text: (text || "").trim() });
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Could not read the uploaded file." });
  }
});

// Serve the built React app in production (deploy package includes dist/).
if (isProduction) {
  app.use(express.static(distPath, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Surface multer/file size errors as clean JSON.
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  return res.status(500).json({ error: err.message || "Unexpected error." });
});

app.listen(PORT, () => {
  console.log(`AI Humanizer backend running on http://localhost:${PORT}`);
});
