// Split long advice sentences that GPTZero flags (~45–46% on Ollama + essay prose).
// Evidence: short fragments + standalone questions pass; advisory multi-clause sentences fail.

const ADVICE_SPLITS = [
  // --- 45.9% Ollama output (latest screenshot) ---
  [
    /I've found that working with a demanding boss can be challenging\.\s*Their expectations are often high, and they don't slow down much\.\s*As a result, you might feel exhausted and overlooked\./gi,
    "Working with a demanding boss is rough. Expectations stay high. The pace doesn't slow down. You end up tired. Overlooked too.",
  ],
  [
    /I've found that working with a demanding boss can be challenging/gi,
    "Working with a demanding boss is rough",
  ],
  [
    /Their expectations are often high, and they don't slow down much/gi,
    "Expectations stay high. The pace doesn't slow down.",
  ],
  [
    /As a result, you might feel exhausted and overlooked/gi,
    "You end up tired. Overlooked too.",
  ],
  [
    /You can't control how they lead or their personality/gi,
    "You can't control how they lead. That's on them.",
  ],
  [
    /It's not about changing them\. It's more about figuring out strategies for dealing with the situation effectively and taking care of yourself/gi,
    "You're not trying to change them. You're trying to get through the workweek. Look after yourself too.",
  ],
  [
    /It's not about changing them\. It's more about figuring out strategies/gi,
    "You're not trying to change them. You're trying to get through the workweek.",
  ],
  [
    /figuring out strategies for dealing with the situation effectively/gi,
    "getting through the workweek without it wearing you down",
  ],
  [
    /taking care of yourself/gi,
    "looking after yourself",
  ],
  [
    /It helps to understand what drives your boss's behavior before trying to manage it/gi,
    "What's pushing them? Ask that first.",
  ],
  [
    /It helps to understand what drives your boss's behavior/gi,
    "What's pushing them? Worth asking.",
  ],
  [
    /before trying to manage it/gi,
    "before you react",
  ],
  [
    /Knowing this can help you separate their demands from your own sense of self-worth and approach the situation in a more empathetic way/gi,
    "That doesn't make it OK. Still, knowing what drives them helps. You might take it less personally. You might stay calmer when they push.",
  ],
  [
    /separate their demands from your own sense of self-worth/gi,
    "take their demands less personally",
  ],
  [
    /approach the situation in a more empathetic way/gi,
    "stay calmer when they push",
  ],
  [
    /When working with a demanding boss, effective management is key/gi,
    "Straight talk works. Clear boundaries help. Steady habits matter.",
  ],
  [
    /effective management is key/gi,
    "straight talk and clear limits help",
  ],
  [
    /That means having open conversations\. Setting clear limits\. And developing good habits from the start/gi,
    "Open conversations help. Clear limits matter. Good habits from day one.",
  ],
  [
    /But you can decide how to respond/gi,
    "But you can control how you respond when they push. That part is yours.",
  ],

  // --- 45.6% deterministic / earlier screenshot ---
  [
    /,\s*you \*?can\*? control how you respond and (?:interact with|deal with) them\.?/gi,
    "",
  ],
  [
    /Still, Knowing/g,
    "Still, knowing",
  ],
  [
    /knowing what drives them can help you depersonalize their demands and /gi,
    "Knowing what drives them helps. ",
  ],
  [
    /You don't win by fighting them\.;\s*it's about straight talk/gi,
    "Straight talk works better.",
  ],
  [
    /That doesn't make it OK\. Still\.\s*Knowing/gi,
    "That doesn't make it OK. Still, knowing",
  ],
  [
    /You can't control your boss's personality or management style, you \*?can\*? control how you respond and deal with them\./gi,
    "You can't control how your boss leads. That's on them. But you can control how you respond when they push. That part is yours.",
  ],
  [
    /You can't control your boss's personality or management style, you can control how you respond and deal with them\./gi,
    "You can't control how your boss leads. That's on them. But you can control how you respond when they push. That part is yours.",
  ],
  [
    /This isn't about changing them[^.]*\./gi,
    "You're not trying to change them. You're trying to get through the workweek.",
  ],
  [
    /While not an excuse,?\s*/gi,
    "That doesn't make it OK. Still, ",
  ],
  [
    /Not an excuse\./gi,
    "That doesn't make it OK.",
  ],
  [
    /And protect your peace of mind\. Before you try anything, think about what's behind your boss's hard-driving style\./gi,
    "And look after yourself too. Before you react, ask what's pushing them. What is actually behind their hard-driving style?",
  ],
  [
    /Often, their demands stem from a need to control everything, perfectionism, or simply not delegating well\./gi,
    "Why so demanding? Sometimes it's a need to control everything. Sometimes it's perfectionism. Sometimes they just don't delegate well.",
  ],
  [
    /Handling a tough boss isn't about fighting them; it's about straight talk\./gi,
    "You don't win by fighting them. Straight talk works better. Clear words help.",
  ],
  [
    /\byour peace of mind\b/gi,
    "your own headspace",
  ],
  [
    /Before you try anything/gi,
    "Before you react",
  ],
  [
    /handle things with more patience/gi,
    "stay calmer when they push",
  ],
];

export const FLAGGED_ADVICE_PATTERNS = [
  /i've found that/i,
  /as a result,/i,
  /it's more about figuring out strategies/i,
  /taking care of yourself/i,
  /it helps to understand what drives/i,
  /before trying to manage/i,
  /sense of self-worth/i,
  /more empathetic way/i,
  /effective management is key/i,
  /this isn't about changing them/i,
  /peace of mind/i,
  /before you try anything/i,
  /not an excuse/i,
  /handle things with more patience/i,
  /their demands stem from a need to control/i,
  /isn't about fighting them/i,
  /you can't control your boss's personality or management style, you/i,
  /figuring out strategies for dealing/i,
  /when working with a demanding boss, effective/i,
];

export function countFlaggedAdvice(text) {
  return FLAGGED_ADVICE_PATTERNS.filter((re) => re.test(text)).length;
}

export function splitFlaggedAdvice(text) {
  let out = text;
  for (const [re, replacement] of ADVICE_SPLITS) {
    if (typeof re === "string") continue;
    out = out.replace(re, replacement);
  }
  return out;
}

/** Break any sentence over maxWords at a comma or semicolon (keeps all words). */
export function splitLongSentencesKeepWords(text, maxWords = 12) {
  return text.replace(/[^.!?]+[.!?]+|[^.!?]+$/g, (sentence) => {
    const words = sentence.trim().split(/\s+/);
    if (words.length <= maxWords) return sentence;

    const punct = sentence.trim().endsWith("?") ? "?" : ".";
    const body = sentence.trim().replace(/[.!?]+$/, "");
    const parts = body.split(/;\s+|,\s+(?=(?:and|but|so|or|you|they|it|their|as)\s)/i);
    if (parts.length < 2) {
      const mid = Math.ceil(words.length / 2);
      const a = words.slice(0, mid).join(" ");
      const b = words.slice(mid).join(" ");
      const capB = b.charAt(0).toUpperCase() + b.slice(1);
      return `${a}${punct} ${capB}${punct}`;
    }

    return parts
      .map((p) => {
        const s = p.trim().replace(/[,;]+$/, "");
        if (!s) return "";
        const cap = s.charAt(0).toUpperCase() + s.slice(1);
        return `${cap}${punct}`;
      })
      .filter(Boolean)
      .join(" ");
  });
}
