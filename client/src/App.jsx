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

function formatFetchError(err) {
  const msg = err?.message || "";
  if (err?.name === "TypeError" && /fetch|network/i.test(msg)) {
    return "Cannot reach the server. Open http://localhost:5173/ and make sure npm run dev is running (ports 5000 + 5173).";
  }
  return msg || "Something went wrong. Please try again.";
}

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
      setError(formatFetchError(err));
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
      setError(formatFetchError(err));
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
        <div className="stats">
          {typeof stats.original_words === "number" && (
            <span>{stats.original_words} words processed</span>
          )}
          {typeof stats.transforms_applied === "number" && (
            <span>{stats.transforms_applied} transforms applied</span>
          )}
          {stats.mode && <span>Mode: {stats.mode}</span>}
          {edited && <span className="edited-note">Edited — save to improve</span>}
        </div>
      )}
    </main>
  );
}
