// Local LLM humanization via Ollama (http://127.0.0.1:11434).
//
// Pipeline goals:
//   1. Preserve 100% of meaning — no summarizing or bullet-point compression.
//   2. Match input length (±15% word count).
//   3. Humanize phrasing, rhythm, and vocabulary.

import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeDetectorSignals } from "./detectorMetrics.js";
import { antiDetectorPassWithScore, compareSignals } from "./antiDetectorPass.js";
import { preCleanInput } from "./smartHumanize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_LOG = path.resolve(__dirname, "../../debug-0cf9d6.log");

// #region agent log
function dbgLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: "0cf9d6",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + "\n");
  } catch {}
  fetch("http://127.0.0.1:7450/ingest/d242bc8c-686f-470d-8acf-51f67d8ecfa6", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0cf9d6" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
// #endregion

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3:8b";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const PING_TIMEOUT_MS = Number(process.env.OLLAMA_PING_TIMEOUT_MS || 4000);
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "1h";
const MAX_PREDICT = Number(process.env.OLLAMA_MAX_PREDICT || 4096);

const FEWSHOT = `EXAMPLE — AI (detector flags high %):
"Organic fertilizers are packed with natural materials like manure and compost that enrich the soil."
"Furthermore, utilizing organic fertilizers can be beneficial for achieving optimal growth outcomes."

EXAMPLE — HUMAN rewrite (different words, same meaning):
"Organic fertilizer mixes in things like compost and manure. That stuff feeds the soil over time."
"You get better growth when you stick with organic options — the plants actually take up more nutrients."

Write like the HUMAN example — genuinely rephrased, not a punctuation shuffle.`;

const SYSTEM_PROMPT = `You rewrite text so it sounds like a real person wrote it — NOT like ChatGPT or a marketing blog.

MANDATORY — CHANGE THE WORDING (not just punctuation):
- Rewrite EVERY sentence with different words, synonyms, and structure.
- WRONG: copying the original and only swapping commas for periods.
- RIGHT: new phrasing that keeps the same facts — reorder clauses, use plain synonyms, vary sentence length.
- Replace stiff/AI words: utilize→use, furthermore→also, in order to→to, beneficial→helps, numerous→many, facilitate→help, leverage→use.

STYLE:
- Conversational but clear. Contractions: don't, it's, you're, can't.
- Mix short and medium sentences. No exclamation marks. No "let's be real" or hype.
- Same paragraph breaks. Keep ALL facts and details. Word count ±15%.
OUTPUT ONLY THE REWRITTEN TEXT.`;

const PARAPHRASE_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

EXTRA RULE: Your last attempt copied too much original wording. This time change at least 60% of phrasing. Every paragraph must use noticeably different sentences.`;

/** Second-pass system prompt — strips remaining AI tone from a draft. */
const DEAI_SYSTEM_PROMPT = `Fix AI-sounding text. Rephrase with plain words and natural rhythm — like a real person, not AI.

${FEWSHOT}

Remove exclamation marks and hype. Keep every fact. Use different words than the draft where possible. OUTPUT ONLY the fixed text.`;

const TEMPERATURE = {
  light: 0.78,
  balanced: 0.88,
  strong: 0.92,
};

function wordCount(text) {
  const t = (text || "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function splitParagraphs(text) {
  // Blank-line paragraphs first; fall back to single newlines (common in pasted text).
  let parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && /\n/.test(parts[0])) {
    parts = parts[0].split(/\n+/).map((p) => p.trim()).filter(Boolean);
  }
  return parts.length ? parts : [text.trim()];
}

/** Enough output tokens so the model can produce full-length rewrites. */
function numPredictFor(inputWords) {
  return Math.min(MAX_PREDICT, Math.max(512, Math.ceil(inputWords * 2.8) + 128));
}

function cleanOutput(text) {
  let out = (text || "").trim();
  out = out.replace(
    /^(?:sure|certainly|here(?:'s| is)|here you go|rewritten text|humanized text)[^\n:]*:?\s*\n+/i,
    ""
  );
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  // Strip accidental bullet lists the model sometimes emits.
  out = out.replace(/^\s*[-•*]\s+/gm, "");
  return out.trim();
}

function makeError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function ensureReachable() {
  const { hostname, port } = new URL(OLLAMA_URL);
  const targetPort = Number(port) || 11434;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const fail = () =>
      reject(
        makeError(
          `Cannot reach Ollama at ${OLLAMA_URL}. Is it running? Start with "ollama serve".`,
          503,
          "OLLAMA_UNAVAILABLE"
        )
      );

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      ok ? resolve() : fail();
    };

    socket.setTimeout(PING_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(targetPort, hostname);
  });
}

function buildPrompt(text, { expansion = false, paragraphMode = false, paraphrase = false } = {}) {
  const words = wordCount(text);
  const paras = splitParagraphs(text);
  const minW = Math.floor(words * 0.85);
  const maxW = Math.ceil(words * 1.15);

  if (paraphrase) {
    return (
      `Your previous rewrite copied too much of the original. REWRITE COMPLETELY with new vocabulary and sentence structures. ` +
      `Target ${minW}–${maxW} words. Keep every fact. Do NOT return near-identical text.\n\nTEXT:\n${text}`
    );
  }

  if (expansion) {
    return (
      `CRITICAL: Your previous rewrite was far too short. The original is ${words} words ` +
      `across ${paras.length} paragraph(s). You MUST produce ${minW}–${maxW} words. ` +
      `Rewrite the FULL text below at full length. Do not summarize.\n\n` +
      `TEXT:\n${text}`
    );
  }

  if (paragraphMode) {
    const target = wordCount(text);
    const pMin = Math.floor(target * 0.85);
    const pMax = Math.ceil(target * 1.15);
    return (
      `Rewrite with NEW words and structure (not just punctuation changes). Target: ${pMin}–${pMax} words (original: ${target}). ` +
      `One paragraph only. Keep all facts.\n\nPARAGRAPH:\n${text}`
    );
  }

  return (
    `Rewrite the text below with genuinely different phrasing — synonyms, new sentence structures, plain tone. ` +
    `Original: ${words} words, ${paras.length} paragraph(s). ` +
    `Output MUST be ${minW}–${maxW} words, ${paras.length} paragraph(s). Preserve every idea.\n\n` +
    `TEXT:\n${text}`
  );
}

/** Second Ollama pass — fix AI tone in the draft. */
async function deAiPass(draft, timeoutMs, intensity) {
  const words = wordCount(draft);
  const prompt =
    `This draft still sounds like AI. Rewrite it in a casual human voice.\n\n` +
    `DRAFT:\n${draft}`;
  const raw = await callOllama(prompt, words, timeoutMs, intensity, DEAI_SYSTEM_PROMPT);
  const cleaned = cleanOutput(raw);
  return cleaned || draft;
}

async function callOllama(prompt, inputWords, timeoutMs, intensity = "balanced", system = SYSTEM_PROMPT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const temperature = TEMPERATURE[intensity] || TEMPERATURE.balanced;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system,
        prompt,
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: {
          temperature,
          top_p: 0.96,
          top_k: 60,
          repeat_penalty: 1.15,
          num_predict: numPredictFor(inputWords),
          num_ctx: 8192,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 404) {
        throw makeError(
          `Model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`,
          502,
          "MODEL_NOT_FOUND"
        );
      }
      throw makeError(
        `Ollama returned ${res.status}. ${detail}`.trim(),
        502,
        "OLLAMA_HTTP_ERROR"
      );
    }

    const data = await res.json();
    const response = data.response || "";
    // #region agent log
    dbgLog(
      "ollama.js:callOllama",
      "ollama generation complete",
      {
        inputWords,
        numPredict: numPredictFor(inputWords),
        temperature,
        intensity,
        outputWords: wordCount(response),
        outputSignals: analyzeDetectorSignals(response),
      },
      "H1"
    );
    // #endregion
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the model clearly summarized instead of rewriting. */
function isTooShort(inputWords, outputWords) {
  if (inputWords < 20) return outputWords < inputWords * 0.6;
  return outputWords < inputWords * 0.75;
}

/**
 * Humanize paragraph-by-paragraph — most reliable way to preserve length and
 * meaning with smaller local models like llama3:8b.
 */
async function humanizeByParagraphs(text, timeoutMs, intensity, { paraphrase = false } = {}) {
  const paragraphs = splitParagraphs(text);
  const results = [];
  const system = paraphrase ? PARAPHRASE_SYSTEM_PROMPT : SYSTEM_PROMPT;

  for (const para of paragraphs) {
    const pWords = wordCount(para);
    const prompt = buildPrompt(para, { paragraphMode: true, paraphrase });
    let raw = await callOllama(prompt, pWords, timeoutMs, intensity, system);
    let cleaned = cleanOutput(raw);

    if (isTooShort(pWords, wordCount(cleaned))) {
      console.log(`[ollama] paragraph too short (${wordCount(cleaned)}/${pWords} words), retrying…`);
      const retryPrompt = buildPrompt(para, { expansion: true, paragraphMode: true });
      raw = await callOllama(retryPrompt, pWords, timeoutMs, intensity);
      cleaned = cleanOutput(raw);
    }

    if (!cleaned) {
      // Last resort: keep original paragraph rather than drop content.
      cleaned = para;
    }
    // Per-paragraph anti-detector pass so LLM essay tone is stripped before join.
    const paraPost = antiDetectorPassWithScore(cleaned);
    cleaned = paraPost.text;
    // #region agent log
    dbgLog(
      "ollama.js:humanizeByParagraphs",
      "paragraph post-process",
      { pWords, heuristicAfter: paraPost.heuristicScore },
      "H19"
    );
    // #endregion
    results.push(cleaned);
  }

  return results.join("\n\n");
}

export async function warmupOllama() {
  try {
    await ensureReachable();
    console.log(`[ollama] warming up ${OLLAMA_MODEL}…`);
    await callOllama("Say OK.", 5, TIMEOUT_MS);
    console.log(`[ollama] ${OLLAMA_MODEL} is ready.`);
  } catch (err) {
    console.warn(`[ollama] warmup skipped: ${err.message}`);
  }
}

export async function humanizeWithOllama(text, opts = {}) {
  await ensureReachable();

  const intensity = opts.intensity || "balanced";
  const paraphrase = Boolean(opts.paraphrase);
  const system = paraphrase ? PARAPHRASE_SYSTEM_PROMPT : SYSTEM_PROMPT;
  // Pre-clean so Ollama doesn't copy AI phrases from the source.
  const source = preCleanInput(text);
  const inputWords = wordCount(source);
  // #region agent log
  dbgLog(
    "ollama.js:humanizeWithOllama",
    "humanize start",
    {
      inputWords,
      paragraphCount: splitParagraphs(source).length,
      inputSignals: analyzeDetectorSignals(source),
      intensity,
      paraphrase,
      postProcessPass: "antiDetector",
    },
    "H5"
  );
  // #endregion
  const attempts = [
    TIMEOUT_MS,
    Math.round(TIMEOUT_MS * 1.25),
    Math.round(TIMEOUT_MS * 1.5),
  ];
  let lastErr;

  for (let i = 0; i < attempts.length; i++) {
    try {
      if (i > 0) console.log(`[ollama] retry ${i + 1}/${attempts.length}`);

      // Paragraph-by-paragraph for anything with 2+ paragraphs or 60+ words.
      const useParagraphMode =
        splitParagraphs(source).length >= 2 || inputWords >= 60;

      let cleaned;
      if (useParagraphMode) {
        cleaned = await humanizeByParagraphs(source, attempts[i], intensity, { paraphrase });
      } else {
        let raw = await callOllama(
          buildPrompt(source, { paraphrase }),
          inputWords,
          attempts[i],
          intensity,
          system
        );
        cleaned = cleanOutput(raw);

        if (isTooShort(inputWords, wordCount(cleaned))) {
          console.log(
            `[ollama] output too short (${wordCount(cleaned)}/${inputWords} words), expanding…`
          );
          raw = await callOllama(
            buildPrompt(source, { expansion: true }),
            inputWords,
            attempts[i],
            intensity
          );
          cleaned = cleanOutput(raw);
        }
      }

      // Second Ollama pass — de-AI the draft before rule-based scrub.
      console.log("[ollama] running de-AI pass…");
      cleaned = await deAiPass(cleaned, attempts[i], intensity);

      const beforePost = cleaned;
      const postResult = antiDetectorPassWithScore(cleaned);
      cleaned = postResult.text;
      const signalCompare = compareSignals(beforePost, cleaned);
      const finalHeuristic = postResult.heuristicScore;

      console.log(
        `[antiDetector] heuristic ${signalCompare.heuristicBefore} → ${finalHeuristic}`
      );

      if (!cleaned) {
        throw makeError("Ollama returned an empty response.", 502, "EMPTY");
      }

      const outWords = wordCount(cleaned);
      console.log(
        `[ollama] done: ${inputWords} → ${outWords} words (${Math.round((outWords / inputWords) * 100)}%)`
      );

      // #region agent log
      dbgLog(
        "ollama.js:humanizeWithOllama",
        "humanize complete",
        {
          inputWords,
          outputWords: outWords,
          lengthRatio: Math.round((outWords / inputWords) * 100),
          useParagraphMode,
          intensity,
          postProcess: signalCompare,
          finalHeuristic,
          outputSignals: analyzeDetectorSignals(cleaned),
          inputSignals: analyzeDetectorSignals(text),
          sourcePreCleaned: source !== text,
        },
        "H2"
      );
      // #endregion

      return { text: cleaned, model: OLLAMA_MODEL, detectorHeuristic: finalHeuristic };
    } catch (err) {
      lastErr = err;

      if (
        err?.cause?.code === "ECONNREFUSED" ||
        err?.code === "ECONNREFUSED" ||
        /ECONNREFUSED|fetch failed/i.test(err?.message || "")
      ) {
        throw makeError(
          `Cannot reach Ollama at ${OLLAMA_URL}. Is it running?`,
          503,
          "OLLAMA_UNAVAILABLE"
        );
      }

      if (err?.name === "AbortError" && i < attempts.length - 1) continue;
      if (err?.name === "AbortError") {
        throw makeError(
          "Ollama took too long. Try again or set OLLAMA_TIMEOUT_MS=600000 in server/.env.",
          504,
          "OLLAMA_TIMEOUT"
        );
      }
      throw err;
    }
  }

  throw lastErr || makeError("Ollama request failed.", 502, "OLLAMA_FAILED");
}

export const ollamaConfig = {
  url: OLLAMA_URL,
  model: OLLAMA_MODEL,
  timeout_ms: TIMEOUT_MS,
  keep_alive: KEEP_ALIVE,
};
