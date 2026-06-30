import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import multer from "multer";
import { extractText } from "./textExtractor.js";
import { humanize } from "./humanizer/engine.js";
import { humanizeWithOllama, ollamaConfig, warmupOllama } from "./humanizer/ollama.js";
import { postProcessHumanized, textSimilarity } from "./humanizer/smartHumanize.js";
import { recordGeneration, recordFeedback, profileSummary } from "./humanizer/feedback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");
const isProduction = fs.existsSync(distPath);

const app = express();
const PORT = process.env.PORT || 5000;
const MAX_CHARS = 50000;

// Set SKIP_OLLAMA=1 to use local phrase-map engine only (fast, less paraphrase).
const SKIP_OLLAMA = /^(1|true|yes)$/i.test(process.env.SKIP_OLLAMA || "");

if (!isProduction) {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const SIMILARITY_RETRY_THRESHOLD = 0.72;

/**
 * Humanize: Ollama rewrites with new wording (primary), local engine fallback, then post-process.
 */
async function handleHumanize(text, intensity, res) {
  const trimmed = (text || "").trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const t0 = Date.now();
  // #region agent log
  fetch('http://127.0.0.1:7450/ingest/d242bc8c-686f-470d-8acf-51f67d8ecfa6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0cf9d6'},body:JSON.stringify({sessionId:'0cf9d6',location:'server/index.js:handleHumanize:start',message:'humanize started',data:{wordCount,charLen:trimmed.length,skipOllama:SKIP_OLLAMA},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  if (!trimmed) {
    return res.status(400).json({ error: "No text provided to humanize." });
  }
  if (trimmed.length > MAX_CHARS) {
    return res.status(400).json({
      error: `Text is too long (${trimmed.length} characters). The limit is ${MAX_CHARS}.`,
    });
  }

  let rawDraft;
  let engine = "ollama";

  if (SKIP_OLLAMA) {
    console.log("[humanize] SKIP_OLLAMA — local phrase-map engine");
    rawDraft = humanize(trimmed, { intensity }).text;
    engine = "local";
  } else {
    try {
      let r = await humanizeWithOllama(trimmed, { intensity });
      rawDraft = r.text;
      const sim = textSimilarity(trimmed, rawDraft);
      console.log(`[humanize] Ollama draft similarity: ${Math.round(sim * 100)}%`);

      if (sim > SIMILARITY_RETRY_THRESHOLD && trimmed.split(/\s+/).length < 400) {
        console.log("[humanize] too similar — retrying with paraphrase prompt");
        r = await humanizeWithOllama(trimmed, { intensity, paraphrase: true });
        rawDraft = r.text;
        const sim2 = textSimilarity(trimmed, rawDraft);
        console.log(`[humanize] paraphrase retry similarity: ${Math.round(sim2 * 100)}%`);
      } else if (sim > SIMILARITY_RETRY_THRESHOLD) {
        console.log("[humanize] too similar but text is long — skipping paraphrase retry to avoid timeout");
      }
    } catch (ollamaErr) {
      console.error("[ollama] error:", ollamaErr.code || "", ollamaErr.message);
      console.log("[humanize] Ollama unavailable — local phrase-map engine");
      rawDraft = humanize(trimmed, { intensity }).text;
      engine = "local";
    }
  }

  const finalized = postProcessHumanized(rawDraft, trimmed);
  const outputText = finalized.text;
  const similarity = textSimilarity(trimmed, outputText);

  console.log(
    `[humanize] ${engine} → ${outputText.split(/\s+/).length} words, ` +
      `similarity ${Math.round(similarity * 100)}%`
  );

  // #region agent log
  fetch('http://127.0.0.1:7450/ingest/d242bc8c-686f-470d-8acf-51f67d8ecfa6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0cf9d6'},body:JSON.stringify({sessionId:'0cf9d6',location:'server/index.js:handleHumanize:done',message:'humanize completed',data:{engine,wordCount,outputWords:outputText.split(/\s+/).length,similarity:Math.round(similarity*100),elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  if (similarity > 0.85) {
    console.warn(`[humanize] WARNING: output still very similar (${Math.round(similarity * 100)}%)`);
  }

  let generationId = null;
  try {
    generationId = recordGeneration({
      input: trimmed,
      output: outputText,
      applied: [],
      mode: intensity || "balanced",
    });
  } catch (err) {
    // Feedback store is optional — don't fail humanization if data/ isn't writable.
    console.error("[humanize] feedback store error:", err.message);
  }

  return res.json({
    humanized_text: outputText,
    original_words: trimmed.split(/\s+/).length,
    output_words: outputText.split(/\s+/).length,
    generation_id: generationId,
    mode: intensity || "balanced",
    engine,
    similarity: Math.round(similarity * 100),
    detector_heuristic: finalized.heuristicScore,
    ai_tells_remaining: finalized.aiTellsRemaining,
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: SKIP_OLLAMA ? "local" : "ollama",
    ollama: ollamaConfig,
    skip_ollama: SKIP_OLLAMA,
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
      `(engine: ${SKIP_OLLAMA ? "local" : "Ollama " + ollamaConfig.model} @ ${ollamaConfig.url})`
  );
  if (!SKIP_OLLAMA) warmupOllama();
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 620000;
server.setTimeout(0);
