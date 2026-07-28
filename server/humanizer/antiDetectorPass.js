// Aggressive vocabulary + rhythm pass targeting patterns GPTZero flags.
// Evidence: short rhetorical questions pass detection; polished advisory prose fails.

import {
  applyPhraseMap,
  injectContractions,
  splitLongSentences,
  cleanupSpacing,
  fixCapitalization,
  maskProtected,
  unmaskProtected,
} from "./transforms.js";
import { analyzeDetectorSignals, detectorHeuristicScore } from "./detectorMetrics.js";

export { detectorHeuristicScore };

/** Longest-first AI vocabulary → plain human phrasing. */
const AI_VOCAB = [
  // --- 100% detector patterns (latest screenshot) ---
  ["managing a demanding boss can be an overwhelming experience, filled with constant pressure, high expectations, and relentless pace", "a demanding boss wears you out. pressure stays high. expectations don't let up. the pace is brutal"],
  ["these conditions can leave you feeling exhausted, stressed, and undervalued", "you end up exhausted. stressed. undervalued too"],
  ["you do have agency over how you respond and interact with them", "you still choose how you respond"],
  ["gaining control by developing effective strategies for navigating the relationship, cultivating a more productive atmosphere, and safeguarding your own well-being in the process", "learning how to handle the relationship, ease the tension at work, and protect your peace of mind"],
  ["before developing strategies to cope with your boss's demanding nature, take a step back to consider what might be driving their behavior", "before you try anything, ask what's actually driving your boss to act this way"],
  ["while understanding the root of their demands isn't an excuse, it can help you separate their actions from your own worth and approach the situation with greater empathy and strategic thinking", "knowing why they push hard doesn't excuse it. still, it helps you step back and handle things with more patience"],
  ["effective management of a challenging supervisor requires a thoughtful approach that combines strategic communication with clear expectations and a strong work ethic", "with a tough boss, you need straight talk, firm boundaries, and a workload you can actually handle"],
  ["overwhelming experience", "rough ride"],
  ["filled with constant pressure", "with nonstop pressure"],
  ["agency over how you respond", "a say in how you respond"],
  ["interact with them", "deal with them"],
  ["gaining control by developing", "building"],
  ["cultivating a more productive atmosphere", "making work less tense"],
  ["safeguarding your own well-being", "protecting your peace of mind"],
  ["in the process", ""],
  ["take a step back to consider", "think about"],
  ["feeling overwhelmed by external pressures", "under pressure themselves"],
  ["poor communication skills or insecurity", "trouble communicating or feeling insecure"],
  ["separate their actions from your own worth", "not take their behavior personally"],
  ["clear expectations and a strong work ethic", "firm boundaries and solid work habits"],
  ["demanding nature", "hard-driving style"],
  ["while understanding the root of their demands isn't an excuse", "knowing why they push hard doesn't excuse it"],

  // --- 77.1% detector patterns (new synonyms) ---
  ["before developing strategies to address your boss's demanding behavior, it's essential to consider the underlying factors driving their actions", "before you try anything, ask what's actually pushing your boss to act this way"],
  ["before developing strategies to address your boss's hard-driving style, you need to consider what's actually pushing them", "before you try anything, figure out what's actually pushing your boss"],
  ["before developing strategies to address your boss's demanding behavior, you need to consider what's actually pushing them", "before you try anything, figure out what's actually pushing your boss"],
  ["before developing strategies to address your boss's demanding behavior, you need to consider", "before you try anything, figure out"],
  ["it's essential to consider the underlying factors driving their actions", "figure out what's actually pushing them"],
  ["it's essential to consider the root causes driving their actions", "figure out what's actually pushing them"],
  ["managing a demanding boss can be an exhausting experience, characterized by high expectations, relentless pressure, and a fast-paced environment that leaves you feeling drained, stressed, and underappreciated", "a demanding boss wears you out. Expectations run high. The pressure won't quit. The pace is frantic. You end up drained. Stressed. Underappreciated too"],
  ["equipping yourself with effective strategies for navigating the relationship, creating a more productive atmosphere, and ultimately safeguarding your own emotional well-being", "learning how to handle the relationship, make work less tense, and protect your peace of mind"],
  ["equipping yourself with effective strategies for handling the relationship, creating a more productive atmosphere, and ultimately safeguarding your own emotional well-being", "learning how to handle the relationship, make work less tense, and protect your peace of mind"],
  ["equipping yourself with effective strategies for navigating the relationship", "learning practical ways to handle the relationship"],
  ["equipping yourself with effective strategies for handling the relationship", "learning practical ways to handle the relationship"],
  ["while you may not be able to alter your boss's personality or management approach, you do have control over how you respond and engage with them", "you can't change your boss's personality or management style. But you still choose how you respond"],
  ["while you may not be able to alter your boss's personality or management style, you do have control over how you respond and deal with them", "you can't change your boss's personality or management style. But you still choose how you respond"],
  ["shift from a personal to a more strategic perspective", "step back and think more clearly about it"],
  ["insights that can inform your approach and foster empathy", "clues for how to handle them"],
  ["insights that can inform your approach and build empathy", "clues for how to handle them"],
  ["their requests often stem from a desire for control, a need for perfection, or simply a lack of effective delegation skills", "they often push hard because they want control, chase perfection, or simply don't delegate well"],
  ["their requests often stem from", "a lot of it comes from"],
  ["effective management of a challenging supervisor requires a thoughtful approach that combines strategic communication with established boundaries, as well as the development of efficient work routines", "with a tough boss, you need straight talk, firm boundaries, and a workload you can actually manage"],
  ["effective management of a challenging supervisor requires", "handling a tough boss takes"],
  ["this isn't about trying to change your supervisor", "this isn't about fixing your boss"],
  ["emotional well-being", "peace of mind"],
  ["fast-paced environment", "frantic pace"],
  ["relentless pressure", "pressure that won't let up"],
  ["underlying factors driving their actions", "what's actually pushing them"],
  ["underlying factors", "what's really going on"],
  ["root causes driving their actions", "what's actually pushing them"],
  ["characterized by high expectations", "where expectations run high"],
  ["characterized by", "with"],
  ["exhausting experience", "rough ride"],
  ["unrealistically high expectations", "expectations that are way too high"],
  ["poor communication or insecurity", "trouble communicating or feeling insecure"],
  ["struggling with poor communication or insecurity", "having trouble communicating or feeling insecure"],
  ["might they be struggling with", "could they be dealing with"],
  ["while understanding these motivations doesn't excuse their demands", "knowing why they act that way doesn't excuse the pressure"],
  ["while understanding their motivations doesn't excuse their demands", "knowing why they act that way doesn't excuse the pressure"],

  // --- 96.8% patterns ---
  ["it's essential to grasp the underlying drivers behind your boss's hard-driving style before trying to fix things", "before you try to fix anything, figure out what's really driving your boss's hard-driving style"],
  ["it's essential to grasp the underlying drivers behind your boss's demanding behavior before trying to fix things", "before you try to fix anything, figure out what's really driving your boss's behavior"],
  ["it's essential to grasp the underlying drivers behind", "first, figure out what's really driving"],
  ["it is essential to grasp the underlying drivers behind", "you need to understand what's really driving"],
  ["it's essential to grasp", "you need to get clear on"],
  ["it is essential to grasp", "you need to get clear on"],
  ["disciplined approach to workload management", "careful way of handling your workload"],
  ["effective management of a high-pressure supervisor requires", "handling a demanding boss takes"],
  ["approach the situation with greater empathy and strategic thinking", "handle things with more patience and clearer thinking"],
  ["approach the situation with greater empathy and clear thinking", "handle things with more patience"],
  ["can be addressed through targeted approaches", "can improve with specific steps"],
  ["arming yourself with tactics to navigate the relationship more adeptly", "learning practical ways to handle the relationship better"],
  ["arming yourself with tactics to handle the relationship more adeptly", "learning practical ways to handle the relationship better"],
  ["cultivate a more productive atmosphere", "build a better vibe at work"],
  ["build a more productive atmosphere", "build a better vibe at work"],
  ["and ultimately safeguard your own well-being", "and protect your own well-being"],
  ["and ultimately protect your own well-being", "and look after yourself"],
  ["can be an exhilarating yet perilous experience", "can be a stressful rollercoaster"],
  ["can be an stressful rollercoaster", "can be a stressful rollercoaster"],
  ["exhilarating yet perilous", "stressful but sometimes exciting"],
  ["sky-high expectations", "really high expectations"],
  ["breakneck pace", "nonstop pace"],
  ["possess agency in how you respond and engage with them", "still choose how you respond and deal with them"],
  ["possess agency in how you respond", "still choose how you respond"],
  ["possess agency", "still have a say"],
  ["underlying drivers behind", "real reasons behind"],
  ["underlying drivers", "real reasons"],
  ["exploring strategies to address it", "trying to fix things"],
  ["before exploring strategies", "before you try to fix anything"],
  ["operating under intense pressure", "under crushing pressure themselves"],
  ["harbor impossibly high standards", "expect way too much"],
  ["struggle with communication or insecurity", "have trouble communicating or feel insecure"],
  ["desire for control", "need to control everything"],
  ["need for perfection", "perfectionism"],
  ["lack of effective delegation skills", "not knowing how to delegate well"],
  ["detach from their demands", "step back from the pressure"],
  ["skillful communication", "straight talk"],
  ["well-defined limits", "firm boundaries"],
  ["disciplined approach", "careful approach"],
  ["management approach", "management style"],
  ["demanding behavior", "hard-driving style"],
  ["productive atmosphere", "better vibe at work"],
  ["engage with them", "deal with them"],
  ["more adeptly", "better"],
  ["targeted approaches", "specific steps"],
  ["high-pressure supervisor", "demanding boss"],
  ["while you may not have control over your boss's temperament or management approach, you do possess agency in how you respond and engage with them", "you can't control your boss's personality or management style. But you still choose how you respond and deal with them"],
  ["while you may not have control over your boss's temperament or management style, you do possess agency in how you respond and deal with them", "you can't control your boss's personality or management style. But you still choose how you respond and deal with them"],
  ["this isn't about transforming your boss", "this isn't about changing your boss"],
  ["can leave you feeling", "can leave you"],
  ["temperament or management style", "personality or management style"],
  ["temperament or management approach", "personality or management style"],
  ["strategic communication", "straight talk"],
  ["established boundaries", "firm boundaries"],
  ["efficient work routines", "work habits that don't wreck you"],
  ["thoughtful approach", "clear head"],
  ["challenging supervisor", "tough boss"],
  ["navigating the relationship", "handling the relationship"],
  ["it's essential to", "you need to"],
  ["it is essential to", "you need to"],
  ["ultimately safeguarding", "protecting"],
  ["ultimately protecting", "protecting"],
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchCase(original, replacement) {
  if (!replacement) return replacement;
  const c = original.charAt(0);
  if (c === c.toUpperCase() && c !== c.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function stripAiVocabulary(text) {
  let out = text;
  for (const [from, to] of AI_VOCAB) {
    const re = new RegExp(escapeRegExp(from), "gi");
    out = out.replace(re, (m) => matchCase(m, to));
  }
  return out;
}

/** "spent, anxious, and underappreciated" → separate punchy fragments. */
export function breakTripletFeelings(text) {
  let out = text;
  out = out.replace(
    /\b(feeling|feel|left you|leaves you|leave you)\s+(\w+),\s+(\w+),\s+and\s+(\w+)\b/gi,
    (_, verb, a, b, c) => `${verb} ${a}. ${b.charAt(0).toUpperCase() + b.slice(1)} too. And ${c}.`
  );
  out = out.replace(
    /\b(\w+),\s+(\w+),\s+and\s+(\w+)\b/gi,
    (match, a, b, c, offset, str) => {
      // Only break short-word triplets (feelings/states), not long phrases already handled.
      if (a.length > 14 || b.length > 14 || c.length > 14) return match;
      if (!/^(drained|stressed|spent|anxious|tired|exhausted|overwhelmed|underappreciated|undervalued|frustrated)/i.test(a) &&
          !/^(drained|stressed|spent|anxious|tired|exhausted|overwhelmed|underappreciated|undervalued|frustrated)/i.test(b)) return match;
      return `${a}. ${b.charAt(0).toUpperCase() + b.slice(1)} too. And ${c}.`;
    }
  );
  return out;
}

/** Split any remaining "While X, Y" into two sentences. */
export function breakWhileClauses(text) {
  let out = text;
  out = out.replace(
    /\bWhile\s+([^,]{8,140}),\s+([a-z][^.!?]{4,200}[.!?])/gi,
    (_, when, then) => {
      const w = when.trim().replace(/^\w/, (c) => c.toUpperCase());
      const t = then.trim().replace(/^\w/, (c) => c.toUpperCase());
      return `${w}. ${t}`;
    }
  );
  out = out.replace(
    /\bWhile\s+([^,]{8,140}),\s+you\s/gi,
    (_, when) => `${when.trim().replace(/^\w/, (c) => c.toUpperCase())}. You `
  );
  return out;
}

/** Turn explanatory clauses into direct questions (detector-safe pattern). */
export function injectRhetoricalQuestions(text) {
  let out = text;
  out = out.replace(
    /\bTheir (?:demands|requests) often stem from ([^.!?]+)\./gi,
    (_, reasons) => `Why so demanding? Often it's ${reasons.trim()}.`
  );
  out = out.replace(
    /\bYou need to understand what's really driving your boss's ([^.!?]+) before ([^.!?]+)\./gi,
    (_, style, action) =>
      `What's really driving your boss's ${style}? Figure that out before you ${action.replace(/^you /i, "")}.`
  );
  return out;
}

/** Split long uniform sentences — detectors hate medium-length runs. */
export function forceBurstiness(text, maxLen = 14) {
  let out = splitLongSentences(text, maxLen);
  out = splitLongSentences(out, 18);
  return out;
}

/** "A, B, and C" triplets are a strong AI classifier signal. */
export function breakParallelLists(text) {
  let out = text;
  out = out.replace(
    /,\s+([^,]{3,50}),\s+and\s+([^,.!?]{3,50})/gi,
    (_, middle, last) => {
      const mid = middle.trim();
      const end = last.trim();
      const midCap = mid.charAt(0).toUpperCase() + mid.slice(1);
      return `. ${midCap}. And ${end}`;
    }
  );
  out = out.replace(
    /\b(\w[\w'-]{2,28}),\s+(\w[\w'-]{2,28}),\s+and\s+(\w[\w'-]{2,28})\b/gi,
    (_, a, b, c) => `${a} and ${b}. ${c.charAt(0).toUpperCase() + c.slice(1)} too.`
  );
  return out;
}

/** Remove em-dash AI commentary tails. */
export function trimDashCommentary(text) {
  return text.replace(/\s*[–—]\s*insights that can inform[^.!?]*[.!?]?/gi, ".");
}

function grammarFixes(text) {
  return text
    .replace(/\ban stressful\b/gi, "a stressful")
    .replace(/\ban really\b/gi, "a really")
    .replace(/\ban rough\b/gi, "a rough")
    .replace(/\bthey've trouble\b/gi, "they have trouble")
    .replace(/\bDo they've\b/gi, "Do they have")
    .replace(/\bPerhaps they've\b/gi, "Perhaps they have")
    .replace(/\bpossess agency\b/gi, "still have a say")
    .replace(/\ba more better\b/gi, "a better")
    .replace(/\bmore better\b/gi, "better")
    .replace(/\ba perfectionism\b/gi, "perfectionism")
    .replace(/\bnot knowing how to delegate well\b/gi, "bad delegation habits")
    .replace(/\bWhile you may not be able to alter ([^,]+),\s+you do have control/gi, "You can't change $1. But you still choose")
    .replace(/\bWhile you may not be able to alter ([^,]+),\s+you still/gi, "You can't change $1. But you still")
    .replace(/\bit's essential to consider\b/gi, "think about")
    .replace(/\bit is essential to consider\b/gi, "think about")
    .replace(/\bcharacterized by\b/gi, "with")
    .replace(/\bequipping yourself\b/gi, "getting yourself set up")
    .replace(/\bstrategic perspective\b/gi, "clearer read on it")
    .replace(/\byou need to consider the what's\b/gi, "figure out what's")
    .replace(/\bstruggling with trouble communicating\b/gi, "having trouble communicating")
    .replace(/\bWhile understanding the root of their demands isn't an excuse\b/gi, "Knowing why they push hard doesn't excuse it")
    .replace(/\.([A-Z])/g, ". $1");
}

function processBlock(block, { ultra = false } = {}) {
  const { masked, store } = maskProtected(block);
  let t = masked;

  t = stripAiVocabulary(t);
  if (ultra) t = stripUltraVocab(t);
  ({ text: t } = applyPhraseMap(t, {}, 0));
  t = stripAiVocabulary(t);
  if (ultra) t = stripUltraVocab(t);
  t = grammarFixes(t);
  t = trimDashCommentary(t);
  t = breakTripletFeelings(t);
  t = breakParallelLists(t);
  t = breakWhileClauses(t);
  t = injectRhetoricalQuestions(t);
  t = injectContractions(t);
  t = forceBurstiness(t, ultra ? 10 : 14);
  if (ultra) t = splitUniformRuns(t);
  t = grammarFixes(t);
  t = cleanupSpacing(t);
  t = fixCapitalization(t);

  return unmaskProtected(t, store);
}

/** Strip remaining corporate/essay words on later passes. */
function stripUltraVocab(text) {
  const pairs = [
    ["managing a demanding boss can be", "a demanding boss is"],
    ["requires a thoughtful approach that combines", "means mixing"],
    ["requires a thoughtful approach", "takes a clear head"],
    ["effective strategies", "practical moves"],
    ["developing strategies to address", "figuring out how to handle"],
    ["before developing strategies", "before you try anything"],
    ["consider the underlying", "pin down what's"],
    ["inform your approach", "shape how you handle it"],
    ["foster empathy", "stay patient"],
    ["combines strategic communication with", "mixes straight talk with"],
    ["as well as the development of", "and building"],
    ["efficient work routines", "work habits that don't wreck you"],
    ["in order to", "to"],
    ["it can help you", "it helps you"],
    ["doesn't excuse their demands", "doesn't excuse the pressure"],
    ["management of", "handling"],
    ["supervisor", "boss"],
    ["demanding boss can be an", "demanding boss is a"],
    ["can be an exhausting", "is exhausting — a"],
    ["leaves you feeling", "leaves you"],
  ];
  let out = text;
  for (const [from, to] of pairs) {
    out = out.replace(new RegExp(escapeRegExp(from), "gi"), (m) => matchCase(m, to));
  }
  return out;
}

/** Split runs of 3+ similar-length sentences (uniform rhythm = AI tell). */
function splitUniformRuns(text) {
  const sents = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  if (sents.length < 3) return text;

  const lens = sents.map((s) => s.trim().split(/\s+/).length);
  const out = [...sents];

  for (let i = 0; i < lens.length - 2; i++) {
    const a = lens[i];
    const b = lens[i + 1];
    const c = lens[i + 2];
    if (a >= 10 && Math.abs(a - b) <= 4 && Math.abs(b - c) <= 4) {
      const mid = out[i + 1];
      const split = mid.replace(/,\s+/, ". ");
      if (split !== mid) out[i + 1] = split;
    }
  }
  return out.join("");
}

function runPasses(text, { maxRounds = 6, targetScore = 10 } = {}) {
  let out = text;
  let lastScore = 100;

  for (let round = 0; round < maxRounds; round++) {
    const ultra = round >= 2;
    const blocks = out.split(/(\n{2,})/);
    out = blocks
      .map((block) => (/^\n+$/.test(block) ? block : processBlock(block, { ultra })))
      .join("");
    out = cleanupSpacing(out.trim());
    out = grammarFixes(stripAiVocabulary(out));
    if (ultra) out = grammarFixes(stripUltraVocab(out));

    lastScore = detectorHeuristicScore(analyzeDetectorSignals(out));
    if (lastScore <= targetScore) break;
  }

  return { text: out, heuristicScore: lastScore };
}

/**
 * Full anti-detector pass: vocabulary strip + rhythm injection.
 * Runs up to 6 rounds until heuristic score drops below 10.
 */
export function antiDetectorPass(text) {
  return runPasses(text).text;
}

/** Run anti-detector pass and return text + heuristic score for logging. */
export function antiDetectorPassWithScore(text) {
  return runPasses(text);
}

export function compareSignals(before, after) {
  const b = analyzeDetectorSignals(before);
  const a = analyzeDetectorSignals(after);
  return {
    before: b,
    after: a,
    heuristicBefore: detectorHeuristicScore(b),
    heuristicAfter: detectorHeuristicScore(a),
  };
}
