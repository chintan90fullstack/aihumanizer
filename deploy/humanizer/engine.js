// The local humanization engine. Orchestrates the conservative transforms
// sentence-by-sentence, applies the learned preference profile, and enforces
// a meaning-preservation guard so no edit is allowed to drop real content.

import stringSimilarity from "string-similarity";
import {
  applyPhraseMap,
  injectContractions,
  trimFiller,
  splitLongSentences,
  cleanupSpacing,
  fixCapitalization,
  maskProtected,
  unmaskProtected,
} from "./transforms.js";
import { PHRASE_MAP } from "./phraseMap.js";
import { loadProfile } from "./feedback.js";

const PHRASE_BY_ID = Object.fromEntries(PHRASE_MAP.map((p) => [p.id, p]));

const STOPWORDS = new Set(
  ("a an the of to in on at for and or but nor so yet as is are was were be been being " +
    "this that these those it its their our your his her my we you they he she i " +
    "with from by about into over under than then them us me do does did has have had " +
    "will would shall should can could may might must not no if while when where which who whom whose " +
    "also more most very just only such each any all some other one two")
    .split(" ")
);

const INTENSITY = {
  light: { fillerRate: 0, split: false, minRetention: 0.9 },
  balanced: { fillerRate: 0.4, split: true, minRetention: 0.85 },
  strong: { fillerRate: 0.8, split: true, minRetention: 0.8 },
};

function contentWords(text) {
  return (text.toLowerCase().match(/\b[a-z][a-z'-]{2,}\b/g) || []).filter(
    (w) => !STOPWORDS.has(w)
  );
}

// Numbers must always survive — they are facts.
function numbers(text) {
  return (text.match(/\d[\d.,]*/g) || []).map((n) => n.replace(/[.,]$/, ""));
}

/**
 * Decide whether a transformed sentence still means the same thing.
 * Allows words we intentionally changed/removed; rejects accidental loss of
 * real content words or any dropped number.
 */
function preservesMeaning(original, transformed, appliedIds, minRetention) {
  // No number may disappear.
  const origNums = numbers(original);
  const newNums = new Set(numbers(transformed));
  for (const n of origNums) {
    if (!newNums.has(n)) return false;
  }

  // Words we deliberately touched are allowed to be absent.
  const allowedRemovals = new Set();
  for (const id of appliedIds) {
    const entry = PHRASE_BY_ID[id];
    if (!entry) continue;
    for (const w of entry.from.toLowerCase().split(/\s+/)) allowedRemovals.add(w);
  }

  const orig = contentWords(original);
  const next = new Set(contentWords(transformed));
  if (orig.length === 0) return true;

  let retained = 0;
  let checked = 0;
  for (const w of orig) {
    if (allowedRemovals.has(w)) continue;
    checked += 1;
    if (next.has(w)) retained += 1;
  }
  if (checked === 0) return true;
  return retained / checked >= minRetention;
}

function splitSentences(paragraph) {
  return paragraph.match(/[^.!?]+[.!?]+(?:["'”]?)|\S[^.!?]*$/g) || [paragraph];
}

function transformSentence(sentence, cfg, profile) {
  const original = sentence;
  const weights = profile.phraseWeights || {};

  let { text, applied } = applyPhraseMap(sentence, weights, 0.5);

  if (profile.contractionBias >= 0.3) {
    text = injectContractions(text);
  }
  text = trimFiller(text, cfg.fillerRate);
  text = cleanupSpacing(text);

  if (!preservesMeaning(original, text, applied, cfg.minRetention)) {
    // Reject the risky transform; fall back to a contractions-only pass,
    // which is always safe.
    const safe = cleanupSpacing(
      profile.contractionBias >= 0.3 ? injectContractions(original) : original
    );
    return { text: safe, applied: [], reverted: true };
  }

  return { text, applied, reverted: false };
}

/**
 * Humanize a block of text locally.
 * @param {string} input
 * @param {{ intensity?: "light"|"balanced"|"strong" }} opts
 */
export function humanize(input, opts = {}) {
  const cfg = INTENSITY[opts.intensity] || INTENSITY.balanced;
  const profile = loadProfile();
  const maxLen = Math.max(16, Math.round(profile.avgTargetLen || 18) + 6);

  const appliedAll = new Set();
  let sentenceCount = 0;
  let revertedCount = 0;

  // Preserve paragraph structure (split on blank lines, keep separators).
  const blocks = input.split(/(\n{2,}|\n)/);

  const out = blocks
    .map((block) => {
      if (/^\s*$/.test(block) || /^\n+$/.test(block)) return block; // separator
      const { masked, store } = maskProtected(block);

      let rebuilt = splitSentences(masked)
        .map((s) => {
          if (!s.trim()) return s;
          sentenceCount += 1;
          const r = transformSentence(s.trim(), cfg, profile);
          r.applied.forEach((id) => appliedAll.add(id));
          if (r.reverted) revertedCount += 1;
          return r.text;
        })
        .join(" ");

      if (cfg.split) rebuilt = splitLongSentences(rebuilt, maxLen);
      rebuilt = fixCapitalization(cleanupSpacing(rebuilt));
      return unmaskProtected(rebuilt, store);
    })
    .join("");

  return {
    text: out.trim(),
    applied: [...appliedAll],
    stats: {
      sentences: sentenceCount,
      reverted: revertedCount,
      intensity: opts.intensity || "balanced",
    },
  };
}
