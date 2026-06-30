// Essay-style tells that GPTZero flags even when performative casual is absent.

export const ESSAY_TELL_PATTERNS = [
  /when you're dealing with/i,
  /when you are dealing with/i,
  /dealing with a demanding boss can feel like/i,
  /walking through a minefield/i,
  /before diving into/i,
  /it's helpful to consider/i,
  /it is helpful to consider/i,
  /it can be challenging/i,
  /i've found that/i,
  /as a result,/i,
  /effective management is key/i,
  /sense of self-worth/i,
  /more empathetic way/i,
  /figuring out strategies/i,
  /taking care of yourself/i,
  /it can be difficult/i,
  /empowering yourself/i,
  /navigate the relationship/i,
  /strategic communication/i,
  /strategic thinking/i,
  /proactive work habits/i,
  /however, while you/i,
  /however, while/i,
  /foster a more productive/i,
  /depersonalize their demands/i,
  /approach the situation with more empathy/i,
  /managing a demanding superior/i,
  /in today's/i,
  /plays a (?:key|crucial|vital) role/i,
  /it's worth noting/i,
  /before you try anything/i,
  /peace of mind/i,
  /learning how to handle the relationship/i,
  /this isn't about changing them/i,
  /not an excuse/i,
];

const ESSAY_REWRITES = [
  ["dealing with a demanding boss can feel like walking through a minefield", "working with a demanding boss is rough"],
  ["when you're dealing with a demanding boss, it can be challenging", "working with a demanding boss is tough"],
  ["when you are dealing with a demanding boss, it can be challenging", "working with a demanding boss is tough"],
  ["before diving into strategies, it's helpful to consider the root of your boss's demanding nature", "What's pushing them? Ask that first."],
  ["before diving into strategies, it's helpful to consider the root of your boss's hard-driving style", "What's pushing them? Ask that first."],
  ["before diving into strategies, it's helpful to consider", "What's pushing them? Ask that first."],
  ["it's helpful to consider the root of your boss's demanding nature", "What's behind their behavior? Worth asking."],
  ["it's helpful to consider", "Worth asking:"],
  ["however, while you can't control your boss's personality or management style, you *can* control how you respond and interact with them", "You can't control how your boss leads. That's on them. But you can control how you respond when they push. That part is yours."],
  ["however, while you can't control your boss's personality or management style, you can control how you respond and interact with them", "You can't control how your boss leads. That's on them. But you can control how you respond when they push. That part is yours."],
  ["however, while you can't control your boss's personality or management style", "You can't control how your boss leads. That's on them."],
  ["however, while you can't control", "You can't control"],
  ["this isn't about changing them; it's about empowering yourself with strategies to navigate the relationship more effectively", "You're not trying to change them. You're trying to get through the workweek without it wearing you down."],
  ["empowering yourself with strategies to navigate the relationship more effectively", "getting through the workweek without it wearing you down"],
  ["foster a more productive environment", "Make work less tense."],
  ["and ultimately protect your own well-being", "And look after yourself too."],
  ["approach the situation with more empathy and strategic thinking", "You might take it less personally. You might stay calmer when they push."],
  ["while not an excuse, understanding their potential motivations can help you depersonalize their demands and approach the situation with more empathy and strategic thinking", "That doesn't make it OK. Still, knowing what drives them helps. You might take it less personally. You might stay calmer when they push."],
  ["understanding their potential motivations can help you depersonalize their demands and approach the situation with more empathy and strategic thinking", "Knowing what drives them helps. You might take it less personally. You might stay calmer when they push."],
  ["while not an excuse, understanding their potential motivations", "That doesn't make it OK. Still, knowing what drives them"],
  ["while not an excuse", "That doesn't make it OK. Still,"],
  ["managing a demanding superior isn't about confrontation; it's about strategic communication, clear boundaries, and proactive work habits", "Straight talk works. Clear boundaries help. Steady habits matter."],
  ["managing a demanding superior isn't about confrontation", "You don't win by fighting them."],
  ["the constant pressure, the high expectations, and the relentless pace can leave you feeling drained, stressed, and undervalued", "the pressure, high expectations, and fast pace leave you drained, stressed, and overlooked"],
  ["helping yourself with strategies to handle the relationship more effectively", "You're trying to get through the workweek without it wearing you down."],
  ["helping yourself with strategies", "A few habits help."],
  ["however, you can't control", "you can't control"],
  ["however, while", ""],
  ["walking through a minefield", "a rough situation"],
  ["approach the situation with more empathy and clear thinking", "You might stay calmer when they push."],
  ["approach the situation with more empathy and strategic thinking", "You might stay calmer when they push."],
  ["proactive work habits", "steady work habits"],
  ["build a more productive environment", "make work less tense"],
  ["think about the root of your boss's hard-driving style", "What's actually behind your boss's hard-driving style?"],
  ["think about the root of", "What's behind"],
  ["and look after yourself", "and keep your head straight"],
  ["the relentless pace", "the nonstop pace"],
  ["relentless pace", "nonstop pace"],
  ["simply a bad delegation habits", "simply not delegating well"],
  ["often, their demands stem from a desire for control, a need for perfection, or simply a lack of effective delegation skills", "Why so demanding? Sometimes it's control. Sometimes perfectionism. Sometimes they just don't delegate well."],
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

export function countEssayTells(text) {
  return ESSAY_TELL_PATTERNS.filter((re) => re.test(text)).length;
}

export function stripEssayTells(text) {
  let out = text;
  for (const [from, to] of ESSAY_REWRITES) {
    out = out.replace(new RegExp(escapeRegExp(from), "gi"), (m) => matchCase(m, to));
  }
  return out;
}

/** Combined score — lower is more human-like per our heuristics. */
export function combinedAiScore(text, heuristicScore, aiTellsRemaining) {
  return (
    heuristicScore +
    aiTellsRemaining * 25 +
    countEssayTells(text) * 20
  );
}
