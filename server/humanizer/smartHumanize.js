// Smart humanization: deterministic de-AI + length preserve + advice sentence splits.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { antiDetectorPass } from "./antiDetectorPass.js";
import { finalizeHumanOutput } from "./finalizeHumanOutput.js";
import { combinedAiScore, stripEssayTells } from "./essayPass.js";
import { splitFlaggedAdvice, splitLongSentencesKeepWords, countFlaggedAdvice } from "./advicePass.js";
import { lengthGuard, wordCount } from "./lengthGuard.js";
import { countAiTells } from "./finalizeHumanOutput.js";

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

/** Rule-based humanizer — no LLM. */
export function deterministicHumanize(text) {
  let t = stripEssayTells(text);
  t = antiDetectorPass(t);
  t = splitFlaggedAdvice(t);
  t = splitLongSentencesKeepWords(t, 14);
  return finalizeHumanOutput(t).text;
}

function lengthPenalty(words, origWords) {
  const ratio = words / Math.max(1, origWords);
  if (ratio < 0.95) return Math.round((0.95 - ratio) * 300);
  if (ratio < 0.98) return Math.round((0.98 - ratio) * 100);
  if (ratio > 1.1) return Math.round((ratio - 1.1) * 40);
  return 0;
}

function scoreFinalized(finalized, text, origWords) {
  return (
    combinedAiScore(text, finalized.heuristicScore, finalized.aiTellsRemaining) +
    countFlaggedAdvice(text) * 15 +
    lengthPenalty(wordCount(text), origWords)
  );
}

function polish(text, originalInput) {
  const origWords = wordCount(originalInput);
  let out = splitFlaggedAdvice(text);
  out = splitLongSentencesKeepWords(out, 12);
  out = splitFlaggedAdvice(out);
  const finalized = finalizeHumanOutput(out);
  out = lengthGuard(finalized.text, originalInput);
  out = splitFlaggedAdvice(out);
  out = splitLongSentencesKeepWords(out, 12);
  const tells = countAiTells(out);
  const outWords = wordCount(out);

  // #region agent log
  dbgLog(
    "smartHumanize.js:polish",
    "polish complete",
    {
      origWords,
      inWords: wordCount(text),
      outWords,
      lengthRatio: Math.round((outWords / origWords) * 100),
      adviceTells: countFlaggedAdvice(out),
      aiTells: tells,
    },
    "H3"
  );
  // #endregion

  return {
    text: out,
    heuristicScore: finalized.heuristicScore,
    aiTellsRemaining: tells,
    wasTransformed: out !== (text || "").trim(),
  };
}

/**
 * Pick output most likely to pass detectors.
 * Deterministic rewrite is default — Ollama llama3:8b prose still scores ~45% on GPTZero
 * even when internal heuristics look clean (runtime evidence: 45.9% run).
 */
export function applySmartGates(ollamaText, originalInput) {
  const origWords = wordCount(originalInput);
  const ollamaInWords = wordCount(ollamaText);

  // #region agent log
  dbgLog(
    "smartHumanize.js:applySmartGates",
    "gates start",
    { origWords, ollamaInWords, ollamaLengthRatio: Math.round((ollamaInWords / origWords) * 100) },
    "H1"
  );
  // #endregion

  const detFinal = polish(deterministicHumanize(originalInput), originalInput);
  const detWords = wordCount(detFinal.text);
  const detAdvice = countFlaggedAdvice(detFinal.text);

  // Prefer deterministic whenever it is clean and near-length (proven lower detection).
  const detUsable =
    detAdvice === 0 &&
    detFinal.aiTellsRemaining <= 1 &&
    detWords >= origWords * 0.93;

  if (detUsable) {
    console.log(`[smart] deterministic preferred (${detWords}/${origWords} words, advice=${detAdvice})`);
    // #region agent log
    dbgLog(
      "smartHumanize.js:applySmartGates",
      "deterministic forced",
      { detWords, origWords, detAdvice, aiTells: detFinal.aiTellsRemaining },
      "H4"
    );
    // #endregion
    return { ...detFinal, engine: "deterministic" };
  }

  const ollamaFinal = polish(ollamaText, originalInput);
  const ollamaWords = wordCount(ollamaFinal.text);
  const ollamaAdvice = countFlaggedAdvice(ollamaFinal.text);

  if (ollamaWords < origWords * 0.75) {
    console.log(`[smart] ollama too short (${ollamaWords}/${origWords}) → deterministic`);
    return { ...detFinal, engine: "deterministic" };
  }

  const detScore = scoreFinalized(detFinal, detFinal.text, origWords);
  const ollamaScore = scoreFinalized(ollamaFinal, ollamaFinal.text, origWords);

  const detOkLength = detWords >= origWords * 0.95;
  const ollamaOkLength = ollamaWords >= origWords * 0.95;

  let useDeterministic;
  if (detOkLength && !ollamaOkLength) {
    useDeterministic = true;
  } else if (!detOkLength && ollamaOkLength) {
    useDeterministic = false;
  } else {
    useDeterministic =
      detAdvice < ollamaAdvice ||
      detFinal.aiTellsRemaining < ollamaFinal.aiTellsRemaining ||
      detScore <= ollamaScore;
  }

  const chosen = useDeterministic ? detFinal : ollamaFinal;

  console.log(
    `[smart] det score=${detScore} words=${detWords}/${origWords} advice=${detAdvice} | ` +
      `ollama score=${ollamaScore} words=${ollamaWords} advice=${ollamaAdvice} → ${useDeterministic ? "deterministic" : "ollama"}`
  );

  // #region agent log
  dbgLog(
    "smartHumanize.js:applySmartGates",
    "gates chosen",
    {
      engine: useDeterministic ? "deterministic" : "ollama",
      detScore,
      ollamaScore,
      detWords,
      ollamaWords,
      origWords,
      chosenWords: wordCount(chosen.text),
      chosenAdvice: countFlaggedAdvice(chosen.text),
      chosenAiTells: chosen.aiTellsRemaining,
    },
    "H2"
  );
  // #endregion

  return { ...chosen, engine: useDeterministic ? "deterministic" : "ollama" };
}

/** Light pre-clean for Ollama — do NOT compress word count before generation. */
export function preCleanInput(text) {
  return (text || "").replace(/\*(\w+)\*/g, "$1").trim();
}

/**
 * Deterministic humanize (~1–3s even for long text). Always returns a result.
 * Ollama is opt-in via USE_OLLAMA=1 — it caused NetworkError on long runs.
 */
export function humanizeDeterministic(originalInput) {
  const origWords = wordCount(originalInput);
  const detFinal = polish(deterministicHumanize(originalInput), originalInput);
  const detWords = wordCount(detFinal.text);
  const detAdvice = countFlaggedAdvice(detFinal.text);

  // #region agent log
  dbgLog(
    "smartHumanize.js:humanizeDeterministic",
    "deterministic complete",
    {
      detWords,
      origWords,
      detAdvice,
      aiTells: detFinal.aiTellsRemaining,
      lengthRatio: Math.round((detWords / origWords) * 100),
    },
    "H5"
  );
  // #endregion

  return { ...detFinal, engine: "deterministic" };
}

/** @deprecated alias — use humanizeDeterministic */
export function tryDeterministicFast(originalInput) {
  const r = humanizeDeterministic(originalInput);
  const origWords = wordCount(originalInput);
  const usable =
    countFlaggedAdvice(r.text) === 0 &&
    r.aiTellsRemaining <= 1 &&
    wordCount(r.text) >= origWords * 0.93;
  return usable ? r : null;
}
