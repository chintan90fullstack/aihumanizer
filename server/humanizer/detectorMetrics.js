// Local AI-likelihood heuristics (ZeroGPT-style gauge — not a cloud detector).
// Tuned so polished LLM essay prose scores high, punchy human prose scores low.

const AI_PHRASES = [
  // Meta / essay glue
  "it is important to note",
  "it's important to note",
  "it is worth noting",
  "it's worth noting",
  "it is essential",
  "it's essential",
  "it is imperative",
  "it's imperative",
  "it is crucial",
  "it's crucial",
  "needless to say",
  "in conclusion",
  "to summarize",
  "to sum up",
  "in summary",
  "all in all",
  "at the end of the day",
  "in today's",
  "in this day and age",
  "when it comes to",
  "plays a crucial role",
  "plays a pivotal role",
  "a wide range of",
  "a variety of",
  "a myriad of",
  "the vast majority",
  "it should be noted",
  "one might argue",
  "it can be argued",
  "bearing in mind",
  "with that in mind",
  "in order to",
  "due to the fact that",
  "in terms of",
  "with regard to",
  "with respect to",
  "as a result of",
  "on the other hand",
  "that being said",
  "having said that",
  "take a step back",
  "dive deeper",
  "delve into",
  "delve deeper",
  "shed light on",
  "pave the way",
  "a double-edged sword",
  "only time will tell",
  "game changer",
  "move the needle",
  "at its core",
  "by and large",
  "for all intents and purposes",

  // Formal connectors (LLM favorites)
  "furthermore",
  "moreover",
  "additionally",
  "consequently",
  "subsequently",
  "nevertheless",
  "nonetheless",
  "therefore",
  "hence",
  "thus,",
  "conversely",
  "notably",
  "importantly",
  "significantly",
  "ultimately",
  "overall,",

  // Inflated / corporate vocabulary
  "leverage",
  "utilize",
  "utilizing",
  "facilitate",
  "underscore",
  "highlights the importance",
  "navigate",
  "navigating",
  "cultivate",
  "cultivating",
  "safeguard",
  "safeguarding",
  "foster",
  "fostering",
  "empower",
  "empowering",
  "enhance",
  "enhancing",
  "streamline",
  "optimize",
  "holistic",
  "robust",
  "seamless",
  "pivotal",
  "multifaceted",
  "comprehensive",
  "innovative",
  "cutting-edge",
  "groundbreaking",
  "paradigm",
  "landscape",
  "tapestry",
  "realm of",
  "embark",
  "journey",
  "harness",
  "synergy",
  "ecosystem",
  "actionable",
  "best practices",
  "key takeaways",
  "deep dive",
  "unpack",
  "nuanced",
  "intricate",
  "plethora",
  "myriad",
  "plethora of",
  "myriad of",

  // Common advisory-essay tells
  "overwhelming experience",
  "exhausting experience",
  "characterized by",
  "filled with constant",
  "relentless pressure",
  "relentless pace",
  "fast-paced environment",
  "underlying factors",
  "underlying drivers",
  "root causes",
  "possess agency",
  "have agency",
  "agency over",
  "equipping yourself",
  "arming yourself",
  "strategic perspective",
  "strategic thinking",
  "strategic communication",
  "emotional well-being",
  "well-being in the process",
  "thoughtful approach",
  "effective strategies",
  "developing strategies",
  "management approach",
  "challenging supervisor",
  "demanding nature",
  "while you may not",
  "while understanding",
  "leave you feeling",
  "it is worth",
  "crucial to understand",
  "essential to consider",
  "essential to grasp",
  "in the process",
  "productive atmosphere",
  "clear expectations",
  "strong work ethic",
];

const TRANSITION_RE =
  /\b(furthermore|moreover|additionally|consequently|subsequently|nevertheless|nonetheless|therefore|however|thus|hence|conversely|notably|importantly|ultimately|overall)\b/gi;

const FORMAL_WORD_RE =
  /\b(utilize|leverag(?:e|es|ing)|facilitat(?:e|es|ing)|underscore[sd]?|holistic|robust|seamless|pivotal|multifaceted|comprehensive|paradigm|tapestry|synergy|ecosystem|actionable|nuanced|intricate|plethora|myriad|cultivate|safeguard|foster|empower|optimize|streamline|harness|embark)\b/gi;

function sentences(text) {
  return (text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function sentenceLengths(text) {
  return sentences(text)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 0);
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

function countMatches(re, text) {
  const m = text.match(re);
  return m ? m.length : 0;
}

export function analyzeDetectorSignals(text) {
  const raw = text || "";
  const lower = raw.toLowerCase();
  const lens = sentenceLengths(raw);
  const words = raw.trim() ? raw.trim().split(/\s+/).filter(Boolean).length : 0;
  const sentCount = lens.length;
  const avgSentenceLen = sentCount
    ? Math.round((lens.reduce((a, b) => a + b, 0) / sentCount) * 10) / 10
    : 0;
  const longSentences = lens.filter((n) => n >= 18).length;
  const shortSentences = lens.filter((n) => n <= 6).length;

  const aiPhraseHits = AI_PHRASES.filter((p) => lower.includes(p));
  // Count total occurrences, not only unique list hits.
  let aiPhraseOccurrences = 0;
  for (const p of aiPhraseHits) {
    let idx = 0;
    while ((idx = lower.indexOf(p, idx)) !== -1) {
      aiPhraseOccurrences += 1;
      idx += p.length;
    }
  }

  const contractions = countMatches(/\b\w+'(?:t|s|re|ve|ll|m|d)\b/gi, raw);
  const questions = countMatches(/\?/g, raw);
  const transitions = countMatches(TRANSITION_RE, raw);
  const formalWords = countMatches(FORMAL_WORD_RE, raw);

  return {
    words,
    sentenceCount: sentCount,
    avgSentenceLen,
    burstinessStdDev: Math.round(stdDev(lens) * 100) / 100,
    minSentenceLen: sentCount ? Math.min(...lens) : 0,
    maxSentenceLen: sentCount ? Math.max(...lens) : 0,
    longSentenceRatio: sentCount ? Math.round((longSentences / sentCount) * 100) / 100 : 0,
    shortSentenceRatio: sentCount ? Math.round((shortSentences / sentCount) * 100) / 100 : 0,
    parallelListCount: parallelListCount(raw),
    aiPhraseCount: aiPhraseHits.length,
    aiPhraseOccurrences,
    aiPhrasesFound: aiPhraseHits.slice(0, 10),
    transitions,
    formalWords,
    questions,
    contractions,
    contractionRate: words ? Math.round((contractions / words) * 1000) / 10 : 0,
  };
}

/**
 * 0–100 AI-likelihood score for the UI gauge.
 * High for polished LLM essay prose; low for punchy contracted human writing.
 */
export function detectorHeuristicScore(signals) {
  let score = 0;

  // Phrase / vocab density
  score += Math.min(42, (signals.aiPhraseOccurrences || signals.aiPhraseCount || 0) * 7);
  score += Math.min(18, (signals.formalWords || 0) * 4);
  score += Math.min(16, (signals.transitions || 0) * 5);
  score += Math.min(20, (signals.parallelListCount || 0) * 10);

  // Uniform medium/long sentences are a strong AI tell.
  // Punchy short writing with low variance is NOT.
  const avg = signals.avgSentenceLen || 0;
  const burst = signals.burstinessStdDev || 0;
  if (avg >= 14 && burst < 4) score += 28;
  else if (avg >= 12 && burst < 5) score += 22;
  else if (avg >= 12 && burst < 8) score += 14;
  else if (avg >= 16 && burst < 10) score += 10;

  if ((signals.longSentenceRatio || 0) >= 0.5) score += 12;
  else if ((signals.longSentenceRatio || 0) >= 0.3) score += 6;

  // No short sentences in a multi-sentence passage
  if ((signals.sentenceCount || 0) >= 3) {
    if ((signals.minSentenceLen || 0) > 10) score += 16;
    else if ((signals.minSentenceLen || 0) > 7) score += 10;
    else if ((signals.minSentenceLen || 0) > 5) score += 5;
  }

  // Few/no contractions
  const cr = signals.contractionRate || 0;
  if (cr < 0.8) score += 14;
  else if (cr < 2) score += 8;
  else if (cr < 3) score += 3;

  // ---- Humanizing offsets ----
  if ((signals.questions || 0) > 0) {
    score -= Math.min(16, signals.questions * 6);
  }
  if (cr >= 5) score -= 18;
  else if (cr >= 3.5) score -= 12;
  else if (cr >= 2.5) score -= 6;

  if ((signals.shortSentenceRatio || 0) >= 0.35) score -= 14;
  else if ((signals.shortSentenceRatio || 0) >= 0.2) score -= 8;

  if ((signals.minSentenceLen || 0) <= 3 && (signals.sentenceCount || 0) >= 3) {
    score -= 10;
  }

  // High burstiness among longer passages = more human rhythm
  if (avg >= 10 && burst >= 10) score -= 10;
  else if (avg >= 10 && burst >= 8) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}
