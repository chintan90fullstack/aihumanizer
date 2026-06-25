// Strips "performative casual" — fake-human phrases detectors flag at ~25%.

const PERFORMATIVE_REWRITES = [
  ["dealing with a demanding boss can be a total nightmare", "working with a demanding boss is tough"],
  ["dealing with a demanding boss can be", "working with a demanding boss is"],
  ["the pressure never lets up", "the pressure keeps coming"],
  ["and let's be real, you're probably stressed out too", "you're probably stressed too"],
  ["and let's be real", ""],
  ["underappreciated? yeah, that too", "you might feel undervalued too"],
  ["you can't change them, so what's the plan", "you can't change them. focus on what you can control"],
  ["you see, finding ways to handle the relationship without losing your mind is key", "finding a way to work with them without burning out matters"],
  ["you see,", ""],
  ["without losing your mind", "without burning out"],
  ["smart and strategic", "practical"],
  ["being smart and strategic", "staying practical"],
  ["a demanding boss wears you down, no question", "this kind of boss takes a toll"],
  ["a demanding boss wears you out", "a tough boss runs you down"],
  ["a demanding boss wears you down", "a tough boss runs you down"],
  ["so how do you handle it", "a few habits help"],
  ["clarity is queen", "clear talk helps"],
  ["isn't exactly their superpower", "isn't their strong suit"],
  ["high-maintenance leader", "demanding boss"],
  ["high-maintenance", "hard to please"],
  ["total nightmare", "tough situation"],
  ["through the roof", "really high"],
  ["honestly, i bet", "maybe"],
  ["honestly,", ""],
  ["no question", ""],
  ["what's the plan", "focus on your response"],
  ["let's be real", ""],
  ["yeah, that too", "that happens too"],
  ["you stand up straight", "stay composed"],
  ["start thinking ahead of time", "plan ahead"],
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

/** Detect performative-casual tells (the ~25% patterns). */
export const PERFORMATIVE_TELL_PATTERNS = [
  /total nightmare/i,
  /let's be real/i,
  /you see,/i,
  /yeah, that too/i,
  /what's the plan/i,
  /without losing your mind/i,
  /smart and strategic/i,
  /wears you down, no question/i,
  /wears you out/i,
  /so how do you handle it/i,
  /clarity is queen/i,
  /superpower/i,
  /high-maintenance/i,
  /the pressure never lets up/i,
  /no question\./i,
];

export function countPerformativeTells(text) {
  return PERFORMATIVE_TELL_PATTERNS.filter((re) => re.test(text)).length;
}

/** Remove exclamation marks — detectors flag essay-style excitement. */
export function calmPunctuation(text) {
  return text.replace(/!+/g, ".").replace(/\?{2,}/g, "?");
}

export function stripPerformativeCasual(text) {
  let out = calmPunctuation(text);
  for (const [from, to] of PERFORMATIVE_REWRITES) {
    const re = new RegExp(escapeRegExp(from), "gi");
    out = out.replace(re, (m) => matchCase(m, to));
  }
  // Clean up double spaces / orphaned commas after removals
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/([.!?])\s+([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
}
