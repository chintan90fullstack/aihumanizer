// Lightweight heuristics that correlate with AI detector scores (for debug logging).
// Not a real detector — used to measure burstiness, AI-tell density, etc.

const AI_PHRASES = [
  "it is important to note",
  "it's essential",
  "it is essential",
  "furthermore",
  "moreover",
  "in conclusion",
  "leverage",
  "navigate",
  "cultivate",
  "safeguard",
  "it's essential to consider",
  "underlying factors",
  "characterized by",
  "exhausting experience",
  "equipping yourself",
  "strategic perspective",
  "emotional well-being",
  "relentless pressure",
  "fast-paced environment",
  "underlying drivers",
  "possess agency",
  "exhilarating yet perilous",
  "sky-high",
  "breakneck",
  "adeptly",
  "skillful communication",
  "well-defined limits",
  "disciplined approach",
  "arming yourself",
  "strategic thinking",
  "plays a crucial role",
  "in today's",
  "at the end of the day",
  "it's worth noting",
  "delve into",
  "holistic",
  "robust",
  "seamless",
  "empower",
  "foster",
  "ultimately",
  "it's imperative",
  "however, while",
  "before diving into",
  "it's helpful to consider",
];

function sentences(text) {
  return (text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function sentenceLengths(text) {
  return sentences(text).map((s) => s.trim().split(/\s+/).filter(Boolean).length);
}

function stdDev(nums) {
  if (!nums.length) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

/** Comma-separated triplets like "a, b, and c". */
function parallelListCount(text) {
  const matches = (text || "").match(
    /\b\w[\w'-]*,\s+\w[\w'-]*(?:,\s+)?(?:and|or)\s+\w[\w'-]*/gi
  );
  return matches ? matches.length : 0;
}

export function analyzeDetectorSignals(text) {
  const lower = (text || "").toLowerCase();
  const lens = sentenceLengths(text);
  const aiPhraseHits = AI_PHRASES.filter((p) => lower.includes(p));
  const contractions = (text.match(/\b\w+'(?:t|s|re|ve|ll|m|d)\b/gi) || []).length;
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;

  return {
    words,
    sentenceCount: lens.length,
    burstinessStdDev: Math.round(stdDev(lens) * 100) / 100,
    minSentenceLen: lens.length ? Math.min(...lens) : 0,
    maxSentenceLen: lens.length ? Math.max(...lens) : 0,
    parallelListCount: parallelListCount(text),
    aiPhraseCount: aiPhraseHits.length,
    aiPhrasesFound: aiPhraseHits.slice(0, 8),
    contractions,
    contractionRate: words ? Math.round((contractions / words) * 1000) / 10 : 0,
  };
}
