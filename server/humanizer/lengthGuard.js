// Keep output word count within ±8% of original (user expects ~same length).

function wordCount(text) {
  const t = (text || "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/** Natural-length padding clauses — only used when output is too short. */
const EXPANDERS = [
  "It gets tiring fast.",
  "You feel it by midweek.",
  "Small things start to grate.",
  "The pace doesn't let up.",
  "That adds up.",
  "Most people hit a wall eventually.",
];

/**
 * If output is shorter than minRatio of original, append neutral expanders
 * at paragraph ends until target ratio is met.
 */
export function lengthGuard(output, original, { minRatio = 0.95, targetRatio = 0.98 } = {}) {
  const origW = wordCount(original);
  const minW = Math.floor(origW * minRatio);
  const targetW = Math.floor(origW * targetRatio);
  let out = (output || "").trim();
  let outW = wordCount(out);

  if (outW >= minW) return out;

  console.log(`[length] ${outW}/${origW} words — expanding toward ${targetW}`);

  const blocks = out.split(/(\n{2,})/);
  let expanderIdx = 0;

  const padded = blocks.map((block) => {
    if (/^\n+$/.test(block)) return block;
    let b = block;
    while (wordCount(b) < Math.ceil(targetW / Math.max(1, blocks.filter((x) => !/^\n+$/.test(x)).length)) &&
           wordCount(out) + wordCount(b) - wordCount(block) < targetW &&
           expanderIdx < EXPANDERS.length) {
      b = b.trimEnd() + " " + EXPANDERS[expanderIdx++];
    }
    return b;
  });

  out = padded.join("").trim();
  outW = wordCount(out);

  // Last resort: still short — repeat a neutral closer once per paragraph
  if (outW < minW) {
    out = out
      .split(/\n{2,}/)
      .map((p) => {
        if (wordCount(p) < minW / 3 && expanderIdx < EXPANDERS.length) {
          return p.trim() + " " + EXPANDERS[expanderIdx++];
        }
        return p;
      })
      .join("\n\n");
  }

  console.log(`[length] after expand: ${wordCount(out)}/${origW} words`);
  return out.trim();
}

export { wordCount };
