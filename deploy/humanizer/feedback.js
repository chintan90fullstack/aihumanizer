// Lightweight, file-based feedback store and self-optimizing preference
// profile. No database server required — works on shared hosting.
//
// Two files live in server/data/:
//   feedback.json  — append-only log of generations and user edits
//   profile.json   — aggregated weights the engine reads to adapt over time
//
// The "learning" here is honest heuristic adaptation: when a user edits the
// humanized output, we check which of our transforms survived their edit and
// nudge those weights up; transforms the user reverted get nudged down. Over
// many samples the engine biases toward changes people actually keep.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { PHRASE_MAP } from "./phraseMap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");

const PHRASE_BY_ID = Object.fromEntries(PHRASE_MAP.map((p) => [p.id, p]));

const DEFAULT_PROFILE = {
  phraseWeights: {}, // id -> 0..2 (default 1 when absent)
  contractionBias: 1, // 0..1
  splitBias: 1, // 0..1
  avgTargetLen: 18, // preferred words per sentence
  samples: 0,
  updatedAt: null,
};

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, "[]");
  if (!fs.existsSync(PROFILE_FILE))
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

export function loadProfile() {
  ensureData();
  return { ...DEFAULT_PROFILE, ...readJson(PROFILE_FILE, DEFAULT_PROFILE) };
}

function saveProfile(profile) {
  profile.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

function loadFeedback() {
  ensureData();
  return readJson(FEEDBACK_FILE, []);
}

function saveFeedback(records) {
  // Keep the log bounded so it never grows unbounded on disk.
  const trimmed = records.slice(-2000);
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(trimmed, null, 2));
}

/** Persist a generation and return its id (used later to attach feedback). */
export function recordGeneration({ input, output, applied, mode }) {
  const records = loadFeedback();
  const id = crypto.randomUUID();
  records.push({
    id,
    input,
    output,
    applied,
    mode,
    edited: null,
    rating: null,
    createdAt: new Date().toISOString(),
  });
  saveFeedback(records);
  return id;
}

function avgSentenceLen(text) {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim());
  if (!sentences.length) return 0;
  const total = sentences.reduce(
    (sum, s) => sum + s.trim().split(/\s+/).length,
    0
  );
  return total / sentences.length;
}

function countContractions(text) {
  return (text.match(/\b\w+'(?:t|s|re|ve|ll|m|d)\b/gi) || []).length;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Attach a user's edited version to a generation and update the profile.
 * Returns the updated profile summary.
 */
export function recordFeedback({ generationId, edited, rating }) {
  const records = loadFeedback();
  const record = records.find((r) => r.id === generationId);
  if (!record) {
    const err = new Error("Unknown generation id.");
    err.status = 404;
    throw err;
  }

  record.edited = edited ?? record.edited;
  record.rating = rating ?? record.rating;
  record.feedbackAt = new Date().toISOString();

  const profile = loadProfile();
  const editedText = (edited || "").toLowerCase();

  if (editedText) {
    // 1. Learn which phrase replacements the user kept vs. reverted.
    for (const id of record.applied || []) {
      const entry = PHRASE_BY_ID[id];
      if (!entry) continue;
      const current = profile.phraseWeights[id] ?? 1;

      if (entry.to && editedText.includes(entry.to.toLowerCase())) {
        // Our replacement survived the human edit -> reinforce it.
        profile.phraseWeights[id] = clamp(current + 0.05, 0, 2);
      } else if (editedText.includes(entry.from.toLowerCase())) {
        // User put the original phrasing back -> discourage this replacement.
        profile.phraseWeights[id] = clamp(current - 0.12, 0, 2);
      }
    }

    // 2. Adapt preferred sentence length toward what the user wrote.
    const userLen = avgSentenceLen(edited);
    if (userLen > 0) {
      const n = profile.samples;
      profile.avgTargetLen = (profile.avgTargetLen * n + userLen) / (n + 1);
    }

    // 3. Adapt contraction preference.
    const genC = countContractions(record.output || "");
    const editC = countContractions(edited);
    if (editC < genC) profile.contractionBias = clamp(profile.contractionBias - 0.08, 0, 1);
    else if (editC >= genC) profile.contractionBias = clamp(profile.contractionBias + 0.03, 0, 1);

    profile.samples += 1;
  }

  saveProfile(profile);
  saveFeedback(records);
  return profileSummary(profile);
}

export function profileSummary(profile = loadProfile()) {
  const weights = profile.phraseWeights || {};
  const tuned = Object.keys(weights).length;
  return {
    samples: profile.samples,
    tuned_phrases: tuned,
    avg_target_sentence_len: Math.round(profile.avgTargetLen * 10) / 10,
    contraction_bias: Math.round(profile.contractionBias * 100) / 100,
    updatedAt: profile.updatedAt,
  };
}
