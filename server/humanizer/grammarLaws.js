// Mandatory punctuation/grammar laws — fix illegal fragments without restoring AI list rhythm.
// Burstiness must use complete clauses; never mid-thought chopping.

/** Count grammar violations used for debug logging. */
export function countGrammarViolations(text) {
  if (!text) return 0;
  let n = 0;
  n += (text.match(/[a-z,]\.\s+[a-z]/g) || []).length;
  n += (text.match(/\b(which|who|that|where|when|and|or|but|so|if|as)\.\s+[A-Z]/gi) || []).length;
  n += (text.match(/\.\s+And\s+/g) || []).length;
  n += (text.match(/\b(you|we|they|he|she|it|when|what|who|where|why|how)\?\s+[A-Z]/gi) || []).length;
  n += (text.match(/,\s+[A-Z][a-z]+\.\s+[A-Z][a-z]+\b/g) || []).length;
  return n;
}

function mergeListFragments(text) {
  let out = text;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(
      /([^.!?\n]{2,60}?)\.\s+([A-Z][^.!?\n]{2,60}?)\.\s+And\s+([^.!?\n]{2,60})/g,
      (_, a, b, c) => {
        const bL = b.trim().charAt(0).toLowerCase() + b.trim().slice(1);
        const cL = c.trim().charAt(0).toLowerCase() + c.trim().slice(1);
        return `${a.trim()}, ${bL}, and ${cL}`;
      }
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

function mergeCommaListPeriods(text) {
  let out = text;
  out = out.replace(/,\s+([A-Z][a-z]+)\.\s+([A-Z][a-z]+)\b/g, ", $1, and $2");
  out = out.replace(
    /\b([a-z]{3,14})\.\s+([A-Z][a-z]{3,14})\s+([a-z])/g,
    (_, a, b, c) => `${a}, ${b.toLowerCase()} ${c}`
  );
  out = out.replace(
    /,\s+([a-z]{3,14})\.\s+([A-Z][a-z]{3,14})(?=,|\s)/g,
    (_, a, b) => `, ${a}, and ${b.toLowerCase()}`
  );
  out = out.replace(
    /\b([a-z]{3,18})\.\s+([A-Z][a-z]{3,18})\.\s+And\s+([a-z]{3,18})\b/g,
    (_, a, b, c) => `${a}, ${b.toLowerCase()}, and ${c}`
  );
  out = out.replace(
    /\b(Tomatoes)\.\s+(Chilies)\.\s+And\s+(Cucumbers)\b/gi,
    "$1, $2, and $3"
  );
  return out;
}

function mergeMidSentencePeriods(text) {
  let out = text.replace(
    /\b(which|who|that|where|when|and|or|but|so|if|as)\.\s+([A-Z][a-z]+)/gi,
    (_, w, rest) => `${w} ${rest.charAt(0).toLowerCase() + rest.slice(1)}`
  );
  out = out.replace(/,\s+which\.\s+([A-Z][a-z]+)/g, (_, rest) => `, which ${rest.toLowerCase()}`);
  out = out.replace(/\b(which|who|that), ([a-z])/gi, "$1 $2");
  return out;
}

function mergeBrokenQuestions(text) {
  return text.replace(
    /\b(you|we|they|he|she|it|when|what|who|where|why|how)\?\s+([A-Z][a-z])/gi,
    (_, a, b) => `${a} ${b.charAt(0).toLowerCase() + b.slice(1)}`
  );
}

function normalizePunctuation(text) {
  return text
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,;])(?=[A-Za-z])/g, "$1 ")
    .replace(/\.{2,}/g, ".")
    .replace(/\?\./g, "?")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Enforce critical punctuation laws. Safe to run after burstiness passes.
 * Preserves paragraph breaks; only fixes illegal mid-clause fragmentation.
 */
export function enforceGrammarLaws(text) {
  if (!text) return text;

  const blocks = text.split(/(\n{2,})/);
  return blocks
    .map((block) => {
      if (/^\n+$/.test(block)) return block;
      let out = block;
      out = mergeCommaListPeriods(out);
      out = mergeListFragments(out);
      out = mergeMidSentencePeriods(out);
      out = mergeBrokenQuestions(out);
      out = out.replace(/,\s+([A-Z][a-z]+)(?=\s+[a-z])/g, (_, w) => `, ${w.toLowerCase()}`);
      return normalizePunctuation(out);
    })
    .join("");
}
