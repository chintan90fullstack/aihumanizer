import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText } from "./textExtractor.js";
import { humanizeWithOllama, ollamaConfig, warmupOllama } from "./humanizer/ollama.js";
import { applySmartGates, humanizeDeterministic } from "./humanizer/smartHumanize.js";
import { recordGeneration, recordFeedback, profileSummary } from "./humanizer/feedback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");
const isProduction = fs.existsSync(distPath);

const app = express();
const PORT = process.env.PORT || 5000;
const MAX_CHARS = 50000;

// Ollama is opt-in. Default is fast deterministic-only (avoids multi-minute hangs / NetworkError).
const USE_OLLAMA = /^(1|true|yes)$/i.test(process.env.USE_OLLAMA || "");

if (!isProduction) {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

// Accept a single uploaded file in memory (max 10 MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * Humanize text. Default: fast deterministic engine (~1–3s).
 * Set USE_OLLAMA=1 to also run the local Ollama LLM (slow on CPU).
 */
async function handleHumanize(text, intensity, res) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return res.status(400).json({ error: "No text provided to humanize." });
  }
  if (trimmed.length > MAX_CHARS) {
    return res.status(400).json({
      error: `Text is too long (${trimmed.length} characters). The limit is ${MAX_CHARS}.`,
    });
  }

  let outputText;
  let engine = "deterministic";
  let detectorHeuristic = null;
  let aiTellsRemaining = null;

  // Default: fast deterministic rewrite (works for short and long text).
  let finalized = humanizeDeterministic(trimmed);
  outputText = finalized.text;
  detectorHeuristic = finalized.heuristicScore;
  aiTellsRemaining = finalized.aiTellsRemaining;
  engine = finalized.engine || "deterministic";
  console.log(`[humanize] deterministic (${outputText.split(/\s+/).length} words)`);

  if (USE_OLLAMA) try {
    engine = "ollama";
    const r = await humanizeWithOllama(trimmed, { intensity });
    finalized = applySmartGates(r.text, trimmed);
    outputText = finalized.text;
    detectorHeuristic = finalized.heuristicScore;
    aiTellsRemaining = finalized.aiTellsRemaining;
    if (finalized.engine) engine = finalized.engine;
  } catch (ollamaErr) {
    console.error("[ollama] error:", ollamaErr.code || "", ollamaErr.message);
    console.log("[humanize] Ollama failed — keeping deterministic result");
    engine = "deterministic";
  }

  if (!outputText) {
    return res.status(503).json({
      error: "Humanization failed. Please try again.",
      code: "HUMANIZE_FAILED",
    });
  }

  try {
    const generationId = recordGeneration({
      input: trimmed,
      output: outputText,
      applied: [],
      mode: intensity || "balanced",
    });

    return res.json({
      humanized_text: outputText,
      original_words: trimmed.split(/\s+/).length,
      output_words: outputText.split(/\s+/).length,
      generation_id: generationId,
      mode: intensity || "balanced",
      engine,
      detector_heuristic: detectorHeuristic,
      ai_tells_remaining: aiTellsRemaining,
    });
  } catch (err) {
    console.error("[humanize] post-processing error:", err);
    return res.status(500).json({ error: "Failed to humanize text." });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: USE_OLLAMA ? "ollama" : "deterministic",
    ollama: ollamaConfig,
    use_ollama: USE_OLLAMA,
    profile: profileSummary(),
  });
});

// Humanize raw text submitted as JSON.
app.post("/api/humanize", async (req, res) => {
  try {
    const { text, intensity } = req.body || {};
    await handleHumanize(text, intensity, res);
  } catch (err) {
    console.error("[api/humanize] unhandled:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || "Server error during humanization.",
        code: "SERVER_ERROR",
      });
    }
  }
});

// Humanize text extracted from an uploaded file.
app.post("/api/humanize-file", upload.single("file"), async (req, res) => {
  try {
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
    await handleHumanize(text, req.body?.intensity, res);
  } catch (err) {
    console.error("[api/humanize-file] unhandled:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || "Server error during humanization.",
        code: "SERVER_ERROR",
      });
    }
  }
});

// Extract plain text from an uploaded file without humanizing it.
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

// Self-improving feedback: store the user's edited version and adapt weights.
app.post("/api/feedback", (req, res) => {
  const { generationId, edited, rating } = req.body || {};
  if (!generationId) {
    return res.status(400).json({ error: "generationId is required." });
  }
  try {
    const summary = recordFeedback({ generationId, edited, rating });
    return res.json({ status: "ok", profile: summary });
  } catch (err) {
    return res
      .status(err.status || 500)
      .json({ error: err.message || "Could not record feedback." });
  }
});

// Inspect the current learned profile.
app.get("/api/profile", (_req, res) => {
  res.json(profileSummary());
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

const server = app.listen(PORT, () => {
  console.log(
    `AI Humanizer running on http://localhost:${PORT} ` +
      `(engine: Ollama ${ollamaConfig.model} @ ${ollamaConfig.url})`
  );
  // Pre-load the model so the first user click isn't a cold start.
  warmupOllama();
});

// Allow long-running Ollama generations (CPU can take several minutes).
// Node's defaults would otherwise close the socket with an empty body,
// which the client sees as a JSON parse error.
server.requestTimeout = 0; // no per-request cap
server.headersTimeout = 0;
server.keepAliveTimeout = 620000;
server.setTimeout(0);
