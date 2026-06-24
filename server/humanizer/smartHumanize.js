// Smart humanization: Ollama for meaning + mandatory rule-based de-AI.
// llama3:8b always drifts toward essay prose — we never trust raw LLM output.

import { antiDetectorPass, antiDetectorPassWithScore } from "./antiDetectorPass.js";
import { countAiTells, finalizeHumanOutput } from "./finalizeHumanOutput.js";

/**
 * Deterministic humanizer — no LLM. Used when Ollama output still scores as AI.
 * Applies nuclear rewrites + anti-detector passes directly on source text.
 */
export function deterministicHumanize(text) {
  return finalizeHumanOutput(text).text;
}

/**
 * Full smart pipeline result after Ollama + all gates.
 */
export function applySmartGates(ollamaText, originalInput) {
  let finalized = finalizeHumanOutput(ollamaText);

  // If Ollama prose still has AI tells, throw it away and rewrite from source rules.
  if (finalized.aiTellsRemaining > 0) {
    console.log(
      `[smart] Ollama output still has ${finalized.aiTellsRemaining} AI tells — using deterministic rewrite`
    );
    finalized = finalizeHumanOutput(deterministicHumanize(originalInput));
  }

  return finalized;
}

/** Pre-clean input so Ollama doesn't echo AI phrases from the source. */
export function preCleanInput(text) {
  return antiDetectorPass(text);
}
