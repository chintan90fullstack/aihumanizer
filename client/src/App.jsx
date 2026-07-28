import { useState, useRef, useEffect } from "react";

const INTENSITIES = [
  { value: "light", label: "Light" },
  { value: "balanced", label: "Balanced" },
  { value: "strong", label: "Strong" },
];

const MAX_CHARS = 50000;
const ACCEPTED = ".txt,.md,.pdf,.docx";

function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function clampPct(n) {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, v));
}

function aiLabel(aiPct) {
  if (aiPct >= 60) return "Likely AI";
  if (aiPct >= 40) return "Uncertain";
  return "Likely Human";
}

function engineLabel(engine) {
  if (!engine) return "local";
  if (engine.startsWith("local")) return "local";
  return engine;
}

/** SVG donut: AI (red) + Human (green), AI % in the center. */
function DonutChart({ aiPct }) {
  const ai = clampPct(aiPct);
  const human = 100 - ai;
  const r = 42;
  const c = 2 * Math.PI * r;
  const aiLen = (ai / 100) * c;
  const humanLen = c - aiLen;
  const centerColor = ai >= 50 ? "#e03e3e" : "#2ecc71";

  return (
    <div className="donut-wrap" aria-hidden>
      <svg viewBox="0 0 120 120" className="donut-svg">
        <circle
          className="donut-track"
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#e8eef5"
          strokeWidth="14"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#e03e3e"
          strokeWidth="14"
          strokeDasharray={`${aiLen} ${c}`}
          strokeDashoffset={0}
          transform="rotate(-90 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#2ecc71"
          strokeWidth="14"
          strokeDasharray={`${humanLen} ${c}`}
          strokeDashoffset={-aiLen}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="donut-center">
        <span className="donut-pct" style={{ color: centerColor }}>
          {ai}%
        </span>
        <span className="donut-sub">AI</span>
      </div>
    </div>
  );
}

function DetectionSide({ title, aiPct }) {
  const ai = clampPct(aiPct);
  const human = 100 - ai;
  return (
    <div className="detection-side">
      <DonutChart aiPct={ai} />
      <div className="detection-meta">
        <div className="detection-side-title">{title}</div>
        <div className="detection-side-label">{aiLabel(ai)}</div>
        <div className="detection-legend">
          <span>
            <i className="dot ai" /> AI {ai}%
          </span>
          <span>
            <i className="dot human" /> Human {human}%
          </span>
        </div>
      </div>
    </div>
  );
}

function DetectionGauge({ stats }) {
  if (!stats) return null;

  const before = clampPct(
    stats.detector_before ?? stats.detector_heuristic ?? 0
  );
  const after = clampPct(
    stats.detector_after ?? stats.detector_heuristic ?? before
  );
  const dropped = Math.max(0, before - after);
  const origWords = stats.original_words ?? 0;
  const outWords = stats.output_words ?? 0;
  const tells = stats.ai_tells_remaining;
  const clean = typeof tells === "number" ? tells <= 0 : after < 15;

  return (
    <section className="detection-card" aria-label="AI detection">
      <header className="detection-header">
        <h2>AI detection</h2>
        <p>Local heuristic gauge (ZeroGPT-style). Not ZeroGPT&apos;s cloud model.</p>
      </header>

      <div className="detection-charts">
        <DetectionSide title="Before humanize" aiPct={before} />
        <div className="detection-arrow" aria-hidden>
          →
        </div>
        <DetectionSide title="After humanize" aiPct={after} />
      </div>

      <div className="detection-footer">
        <span>
          AI score dropped <strong>{dropped} points</strong>
        </span>
        <span>
          {origWords} → {outWords} words
        </span>
        <span>Engine: {engineLabel(stats.engine)}</span>
      </div>

      <div className={`detection-status ${clean ? "ok" : "warn"}`}>
        {clean
          ? "No strong AI sentence flags remaining."
          : `${tells} strong AI sentence flag${tells === 1 ? "" : "s"} still present.`}
      </div>
    </section>
  );
}

// Safely parse a response body. Long Ollama runs can occasionally return an
// empty or non-JSON body (e.g. a proxy/connection drop); turn that into a
// clear message instead of a cryptic "JSON.parse: unexpected end of data".
async function parseJsonSafe(res) {
  const raw = await res.text();
  if (!raw) {
    if (res.status === 504 || res.status === 502) {
      throw new Error(
        "The request timed out. The model may still be loading on CPU — wait a moment and try again."
      );
    }
    throw new Error(
      `The server returned an empty response (status ${res.status}). Please try again.`
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(raw.slice(0, 300));
  }
}

export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [intensity, setIntensity] = useState("balanced");

  const [generationId, setGenerationId] = useState(null);
  const [generatedText, setGeneratedText] = useState("");

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("");
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const fileInputRef = useRef(null);

  // Progressive hints while Ollama runs (CPU can take 1–3+ minutes).
  useEffect(() => {
    if (!loading) {
      setLoadingHint("");
      return;
    }
    setLoadingHint("Humanizing…");
    const t1 = setTimeout(
      () => setLoadingHint("Loading model — first request can take 1–3 min on CPU…"),
      8000
    );
    const t2 = setTimeout(
      () => setLoadingHint("Still working — llama3:8b is rewriting your text…"),
      45000
    );
    const t3 = setTimeout(
      () => setLoadingHint("Almost there — large models on CPU need patience…"),
      120000
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  const canSubmit = !loading && input.trim().length > 0;
  const edited = output !== generatedText;

  async function handleHumanize() {
    setError("");
    setOutput("");
    setStats(null);
    setCopied(false);
    setSaved(false);
    setGenerationId(null);
    setLoading(true);

    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, intensity }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setOutput(data.humanized_text || "");
      setGeneratedText(data.humanized_text || "");
      setGenerationId(data.generation_id || null);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data.error || "Could not read the file.");
      }
      setInput(data.text || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Send the user's edited version back so the engine can learn from it.
  async function submitFeedback() {
    if (!generationId) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, edited: output }),
      });
      setSaved(true);
      setGeneratedText(output);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Could not save feedback.");
    }
  }

  function clearInput() {
    setInput("");
    setOutput("");
    setGeneratedText("");
    setGenerationId(null);
    setStats(null);
    setError("");
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download(ext) {
    setDownloadOpen(false);
    if (!output) return;
    const blob = new Blob([output], {
      type: ext === "md" ? "text/markdown" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `humanized.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="card">
      <div className="panels">
        {/* Input panel */}
        <section className="panel">
          <textarea
            className="panel-text"
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your content here"
          />
          <div className="panel-footer">
            <div className="counts">
              <span>Word: {countWords(input)}</span>
              <span>
                Character: {input.length}/{MAX_CHARS.toLocaleString()}
              </span>
            </div>
            <div className="panel-actions">
              <button className="link-btn" onClick={clearInput}>
                <span aria-hidden>🗑</span> Clear
              </button>
              <button
                className="pill-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Reading…" : "Upload"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                hidden
                onChange={handleUpload}
              />
            </div>
          </div>
        </section>

        {/* Output panel (editable — edits train the engine) */}
        <section className="panel">
          <textarea
            className="panel-text"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder={loading ? loadingHint : "The result will be shown here"}
          />
          <div className="panel-footer">
            <div className="counts">
              <span>Word: {countWords(output)}</span>
              <span>Character: {output.length}</span>
            </div>
            <div className="panel-actions">
              <button
                className="link-btn"
                disabled={!generationId || !edited}
                onClick={submitFeedback}
                title="Save your edits so the engine learns from them"
              >
                <span aria-hidden>✓</span> {saved ? "Saved" : "Save & improve"}
              </button>
              <div className="dropdown">
                <button
                  className="link-btn"
                  disabled={!output}
                  onClick={() => setDownloadOpen((v) => !v)}
                >
                  <span aria-hidden>⬇</span> Download <span aria-hidden>⌄</span>
                </button>
                {downloadOpen && output && (
                  <div className="dropdown-menu">
                    <button onClick={() => download("txt")}>.txt</button>
                    <button onClick={() => download("md")}>.md</button>
                  </div>
                )}
              </div>
              <button className="link-btn" disabled={!output} onClick={copyOutput}>
                <span aria-hidden>⧉</span> {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="controls">
        <div className="options">
          <label>
            Intensity
            <select
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
            >
              {INTENSITIES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary" disabled={!canSubmit} onClick={handleHumanize}>
          {loading ? loadingHint || "Humanizing…" : "Humanize"}
        </button>
      </div>

      {stats && (
        <>
          <DetectionGauge stats={stats} />
          {edited && (
            <div className="stats">
              <span className="edited-note">Edited — save to improve</span>
            </div>
          )}
        </>
      )}
    </main>
  );
}
