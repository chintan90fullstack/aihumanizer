// Low-level, meaning-preserving text transforms used by the humanization
// engine. Every function here is intentionally conservative: it changes how
// text reads, not what it says.

import { PHRASE_MAP } from "./phraseMap.js";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Make a replacement match the capitalization of the text it replaces.
function matchCase(original, replacement) {
  if (!replacement) return replacement;
  const firstChar = original.charAt(0);
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Quoted text is masked before transforms and restored after, so we never
// rewrite something the author quoted verbatim.
export function maskProtected(text) {
  const store = [];
  const masked = text.replace(/"[^"]*"|“[^”]*”|'[^']{3,}'/g, (m) => {
    store.push(m);
    return `\u0000${store.length - 1}\u0000`;
  });
  return { masked, store };
}

export function unmaskProtected(text, store) {
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => store[Number(i)] ?? "");
}

/**
 * Replace AI-cliché phrases with natural equivalents.
 * Only applies a replacement when its learned weight clears `threshold`.
 * Returns the new text plus the list of replacement ids that fired.
 */
export function applyPhraseMap(text, weights = {}, threshold = 0.5) {
  let out = text;
  const applied = [];

  for (const entry of PHRASE_MAP) {
    const weight = weights[entry.id] ?? 1;
    if (weight < threshold) continue;

    const re = new RegExp(`\\b${escapeRegExp(entry.from)}\\b`, "gi");
    let hit = false;
    out = out.replace(re, (match) => {
      hit = true;
      return matchCase(match, entry.to);
    });
    if (hit) applied.push(entry.id);
  }

  return { text: out, applied };
}

const CONTRACTIONS = [
  ["cannot", "can't"],
  ["can not", "can't"],
  ["do not", "don't"],
  ["does not", "doesn't"],
  ["did not", "didn't"],
  ["is not", "isn't"],
  ["are not", "aren't"],
  ["was not", "wasn't"],
  ["were not", "weren't"],
  ["have not", "haven't"],
  ["has not", "hasn't"],
  ["had not", "hadn't"],
  ["will not", "won't"],
  ["would not", "wouldn't"],
  ["should not", "shouldn't"],
  ["could not", "couldn't"],
  ["must not", "mustn't"],
  ["would have", "would've"],
  ["should have", "should've"],
  ["could have", "could've"],
  ["it is", "it's"],
  ["that is", "that's"],
  ["there is", "there's"],
  ["here is", "here's"],
  ["what is", "what's"],
  ["who is", "who's"],
  ["they are", "they're"],
  ["we are", "we're"],
  ["you are", "you're"],
  ["i am", "I'm"],
  ["i will", "I'll"],
  ["we will", "we'll"],
  ["you will", "you'll"],
  ["they will", "they'll"],
  ["it will", "it'll"],
  ["i have", "I've"],
  ["we have", "we've"],
  ["you have", "you've"],
  ["they have", "they've"],
  ["let us", "let's"],
];

/** Inject natural contractions (do not -> don't). */
export function injectContractions(text) {
  let out = text;
  for (const [from, to] of CONTRACTIONS) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
    out = out.replace(re, (match) => matchCase(match, to));
  }
  return out;
}

const FILLER = ["very", "really", "quite", "rather", "actually", "simply", "just", "literally"];

/** Remove low-value intensifiers/fillers. `rate` 0..1 controls how many. */
export function trimFiller(text, rate = 0) {
  if (rate <= 0) return text;
  let out = text;
  for (const word of FILLER) {
    const re = new RegExp(`\\b${word}\\s+`, "gi");
    out = out.replace(re, (match) => (Math.random() < rate ? "" : match));
  }
  return out;
}

function wordCount(s) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Add sentence-length "burstiness" by splitting overly long sentences at safe
 * boundaries (semicolons, and coordinated independent clauses). Humans vary
 * sentence length far more than LLMs do.
 */
export function splitLongSentences(text, maxLen = 28) {
  return text.replace(/[^.!?]+[.!?]+|\S+$/g, (sentence) => {
    if (wordCount(sentence) <= maxLen) return sentence;

    // Only split at semicolons — never chop comma lists or relative clauses.
    const idx = sentence.indexOf("; ");
    if (idx === -1) return sentence;

    const first = sentence.slice(0, idx).trim().replace(/[,;]+$/, "");
    let second = sentence.slice(idx + 2).trim();
    if (!second) return sentence;
    second = second.charAt(0).toUpperCase() + second.slice(1);
    const endPunct = sentence.trim().endsWith("?") ? "?" : ".";
    return `${first}${endPunct} ${second}`;
  });
}

/** Normalise spacing/punctuation after edits (esp. after filler removal). */
export function cleanupSpacing(text) {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^\s*[,.;:]\s*/gm, "")
    .trim();
}

/** Capitalize sentence starts and the standalone pronoun "i". */
export function fixCapitalization(text) {
  let out = text.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
  out = out.replace(/\bi\b/g, "I");
  return out;
}
