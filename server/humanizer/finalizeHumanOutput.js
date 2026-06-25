// Mandatory final gate — every humanized response MUST pass through here.
// Ollama always produces detector-flagged prose; this layer is non-optional.

import { antiDetectorPassWithScore, detectorHeuristicScore } from "./antiDetectorPass.js";
import { stripPerformativeCasual, countPerformativeTells } from "./performativePass.js";
import { stripEssayTells, countEssayTells } from "./essayPass.js";
import { splitFlaggedAdvice, countFlaggedAdvice } from "./advicePass.js";
import { analyzeDetectorSignals } from "./detectorMetrics.js";

/** Phrases that GPTZero flags — if ANY remain, keep scrubbing. */
const AI_TELL_PATTERNS = [
  /overwhelming experience/i,
  /filled with constant pressure/i,
  /exhausting experience/i,
  /characterized by/i,
  /agency over how you/i,
  /possess agency/i,
  /developing effective strategies/i,
  /cultivating a more productive/i,
  /safeguarding your own/i,
  /gaining control by/i,
  /equipping yourself/i,
  /strategic thinking/i,
  /thoughtful approach that combines/i,
  /effective management of a challenging supervisor/i,
  /take a step back to consider/i,
  /underlying factors/i,
  /underlying drivers/i,
  /it's essential to/i,
  /it is essential to/i,
  /navigating the relationship/i,
  /greater empathy and/i,
  /separate their actions from your own worth/i,
  /in the process\./i,
  /relentless pace/i,
  /high expectations, and relentless/i,
  /total nightmare/i,
  /let's be real/i,
  /you see,/i,
  /without losing your mind/i,
  /smart and strategic/i,
  /wears you down, no question/i,
  /so how do you handle it/i,
  /clarity is queen/i,
  /high-maintenance/i,
  /the pressure never lets up/i,
];

/** Full-sentence rewrites for the most common AI essay openers. */
const NUCLEAR_REWRITES = [
  [
    /Managing a demanding boss can be an overwhelming experience, filled with constant pressure, high expectations, and relentless pace\./gi,
    "A demanding boss wears you out. Pressure stays high. Expectations don't let up. The pace is brutal.",
  ],
  [
    /These conditions can leave you feeling exhausted, stressed, and undervalued\./gi,
    "You end up exhausted. Stressed. Undervalued too.",
  ],
  [
    /While you may not be able to alter your boss's personality or management approach, you do have agency over how you respond and interact with them\./gi,
    "You can't change your boss's personality or style. But you still choose how you respond.",
  ],
  [
    /This isn't about trying to change their behavior; it's about gaining control by developing effective strategies for navigating the relationship, cultivating a more productive atmosphere, and safeguarding your own well-being in the process\./gi,
    "This isn't about fixing them. It's about learning how to handle the relationship, ease the tension at work, and protect your peace of mind.",
  ],
  [
    /Before developing strategies to cope with your boss's demanding nature, take a step back to consider what might be driving their behavior\./gi,
    "Before you try anything, ask what's actually driving your boss to act this way.",
  ],
  [
    /While understanding the root of their demands isn't an excuse, it can help you separate their actions from your own worth and approach the situation with greater empathy and strategic thinking\./gi,
    "Knowing why they push hard doesn't excuse it. Still, it helps you step back and handle things with more patience.",
  ],
  [
    /Effective management of a challenging supervisor requires a thoughtful approach that combines strategic communication with clear expectations and a strong work ethic\./gi,
    "With a tough boss, you need straight talk, firm boundaries, and a workload you can actually handle.",
  ],
  [
    /Are they struggling with poor communication skills or insecurity\?/gi,
    "Could they have trouble communicating or feel insecure?",
  ],
  [
    /Are they feeling overwhelmed by external pressures\?/gi,
    "Are they under pressure themselves?",
  ],
  // --- 25% detector patterns (performative casual) ---
  [
    /Dealing with a demanding boss can be a total nightmare! The pressure never lets up\./gi,
    "Working with a demanding boss is tough. The pressure keeps coming.",
  ],
  [
    /And let's be real, you're probably stressed out too\. Underappreciated\? Yeah, that too\./gi,
    "You're probably stressed too. You might feel undervalued as well.",
  ],
  [
    /You can't change them, so what's the plan\?/gi,
    "You can't change them. Focus on what you can control.",
  ],
  [
    /You see, finding ways to handle the relationship without losing your mind is key\./gi,
    "Finding a way to work with them without burning out matters.",
  ],
  [
    /It's not about changing their attitude or management style; it's about you being smart and strategic\./gi,
    "It's not about changing how they lead. It's about staying practical on your end.",
  ],
  [
    /A demanding boss wears you down, no question\. So how do you handle it\?/gi,
    "This kind of boss takes a toll. A few habits help.",
  ],
];

export function countAiTells(text) {
  return (
    AI_TELL_PATTERNS.filter((re) => re.test(text)).length +
    countPerformativeTells(text) +
    countEssayTells(text) +
    countFlaggedAdvice(text)
  );
}

function nuclearScrub(text) {
  let out = text;
  for (const [re, replacement] of NUCLEAR_REWRITES) {
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Final mandatory transform. Called from index.js on EVERY response.
 * Returns { text, heuristicScore, aiTellsRemaining, wasTransformed }.
 */
export function finalizeHumanOutput(text) {
  const original = (text || "").trim();
  let out = original;
  let heuristic = detectorHeuristicScore(analyzeDetectorSignals(out));
  let tells = countAiTells(out);

  // Phase 0: strip essay + performative casual + split flagged advice
  out = stripEssayTells(out);
  out = stripPerformativeCasual(out);
  out = splitFlaggedAdvice(out);
  tells = countAiTells(out);

  // Phase 1: iterative anti-detector passes (run until clean or max 10 rounds)
  for (let i = 0; i < 10 && tells > 0; i++) {
    out = stripEssayTells(out);
    out = stripPerformativeCasual(out);
    const result = antiDetectorPassWithScore(out);
    out = result.text;
    heuristic = result.heuristicScore;
    tells = countAiTells(out);
  }

  if (tells > 0) {
    out = nuclearScrub(out);
    const result = antiDetectorPassWithScore(out);
    out = result.text;
    heuristic = result.heuristicScore;
    tells = countAiTells(out);
  }

  const wasTransformed = out !== original;
  console.log(
    `[finalize] transformed=${wasTransformed} heuristic=${heuristic} aiTells=${tells} ` +
      `(was ${original.slice(0, 60)}…)`
  );

  return { text: out, heuristicScore: heuristic, aiTellsRemaining: tells, wasTransformed };
}
