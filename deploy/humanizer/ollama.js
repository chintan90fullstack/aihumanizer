// Local LLM humanization via Ollama (http://127.0.0.1:11434).

import net from "net";

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3:8b";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
const PING_TIMEOUT_MS = Number(process.env.OLLAMA_PING_TIMEOUT_MS || 4000);

// Anchored system prompt focused purely on 10th-grade clarity and rhythm breaking
const SYSTEM_PROMPT = `You are an average office employee explaining a situation directly to a coworker. Use simple, plain, 10th-grade English. Your writing must be direct, boring, and free of all poetic phrasing.

Strictly follow these mechanical constraints to completely bypass pattern detectors:
1. NO SLANG, IDIOMS, OR METAPHORS: You are strictly forbidden from using expressive imagery. Do not use words like "minefield," "battery," "capisce," "tune," "under siege," "lousy," "tit-for-tat," "landmines," or "vibe." Use plain words like "difficult," "tired," "stressful," "excuse," "argue," or "rules."
2. REMOVE ALL 3-ITEM LISTS: Never write a sentence that groups three or more descriptions or verbs using commas (e.g., ban "A, B, and C"). Pick only one point, or create completely separate sentences.
3. FLATTEN SENTENCE LENGTHS: Write in short, choppy sentences. Do not use complex grammar. Every sentence must be simple and easy to read.
4. FRAGMENT THE PARAGRAPHS: Keep paragraphs tiny (maximum 2 sentences per block). This breaks up the structural fingerprint of the original corporate essay.
5. EXPLAIN, DO NOT REWRITE: Do not copy the sentence flow of the input text. Just explain the core advice cleanly as if typing a fast message on a phone.

OUTPUT ONLY THE REWRITTEN PROSE. No intro notes, no closing comments, no quotes.`;

const INTENSITY_NOTE = {
  light: "Make light edits: fix robotic phrasing and improve flow, but keep the structure close to the original.",
  balanced: "Rewrite naturally with moderate restructuring.",
  strong: "Aggressively restructure sentences and word choice while strictly preserving meaning.",
};

const INTENSITY_TEMP = { light: 0.5, balanced: 0.8, strong: 0.95 };

/** Remove any preamble/quote wrapping a chatty model might add. */
function cleanOutput(text) {
  let out = (text || "").trim();
  out = out.replace(
    /^(?:sure|certainly|here(?:'s| is)|here you go|rewritten text|humanized text)[^\n:]*:?\s*\n+/i,
    ""
  );
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }
  
  // ALGORITHMIC CLEANUP: Post-process the text to physically remove typical AI patterns 
  // that slip past the prompt window.
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n'); // Forces human-like paragraph fragmentation
}

function makeError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function ensureReachable() {
  const { hostname, port } = new URL(OLLAMA_URL);
  const targetPort = Number(port) || 11434;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const fail = () =>
      reject(
        makeError(
          `Cannot reach Ollama at ${OLLAMA_URL}. Is it running? Start it with "ollama serve".`,
          503,
          "OLLAMA_UNAVAILABLE"
        )
      );

    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      ok ? resolve() : fail();
    };

    socket.setTimeout(PING_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(targetPort, hostname);
  });
}

/** Cleaned and unified fetch controller for Ollama payload compliance */
async function callOllama(incomingBody, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Merge the dynamically calculated intensity variables with our anti-pattern options
    const fullyConfiguredBody = {
      model: incomingBody.model,
      prompt: incomingBody.prompt,
      system: incomingBody.system,
      stream: false,
      options: {
        temperature: incomingBody.options.temperature || 0.8,
        top_p: incomingBody.options.top_p || 0.85,
        repeat_penalty: 1.4,      // Punishes formatting patterns and list structures
        presence_penalty: 0.6,    // Forces diverse phrase layouts
        frequency_penalty: 0.5    // Stops the model from recycling common AI words
      }
    };
    
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullyConfiguredBody), 
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 404) {
        throw makeError(
          `Model "${OLLAMA_MODEL}" not found in Ollama. Run: ollama pull ${OLLAMA_MODEL}`,
          502,
          "MODEL_NOT_FOUND"
        );
      }
      throw makeError(
        `Ollama returned ${res.status}. ${detail}`.trim(),
        502,
        "OLLAMA_HTTP_ERROR"
      );
    }

    const data = await res.json();
    return data.response || "";
  } finally {
    clearTimeout(timer);
  }
}