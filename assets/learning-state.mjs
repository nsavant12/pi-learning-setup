import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const marker = "<!-- pi-learning-generated -->";
const intervals = [1, 3, 7, 14, 30];
const day = (date) => date.toISOString().slice(0, 10);
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();

export function loadState(root) {
  const path = join(root, ".pi", "learning-state.json");
  if (!existsSync(path)) return { version: 1, concepts: {} };
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (state.version !== 1 || !state.concepts || Array.isArray(state.concepts)) {
    throw new Error("Unexpected learning-state format; preserved the file.");
  }
  return state;
}

export function renderNotes(state) {
  const rows = Object.values(state.concepts).sort((a, b) => a.topic.localeCompare(b.topic) || a.concept.localeCompare(b.concept));
  const progress = [marker, "# Learning progress", "",
    "Generated from observed answers. Personal goals and preferences belong in [[Learner]].",
    "A correct answer today is evidence of understanding today; retained means a correct answer on a later day.", "",
    "| Topic / concept | Status | Observed evidence | Misconception / gap | Next step | Last checked |",
    "|---|---|---|---|---|---|"];
  for (const row of rows) progress.push(`| ${cell(row.topic)} / ${cell(row.concept)} | ${row.status} | ${cell(row.evidence)} | ${cell(row.misconception)} | ${cell(row.nextStep)} | ${row.lastChecked} |`);
  if (!rows.length) progress.push("| No learning evidence recorded yet | — | — | — | — | — |");
  const review = [marker, "# Review queue", "", "Try each question before looking up the explanation. Due dates are suggestions; ask the teacher to adjust the pace.", "",
    "| Due | Topic / concept | Retrieval question | Status |", "|---|---|---|---|"];
  for (const row of [...rows].sort((a, b) => a.nextReview.localeCompare(b.nextReview))) {
    review.push(`| ${row.nextReview} | ${cell(row.topic)} / ${cell(row.concept)} | ${cell(row.reviewQuestion)} | ${row.status} |`);
  }
  if (!rows.length) review.push("| — | No review items yet | Questions appear after learning evidence is recorded | — |");
  return { "Progress.md": progress.join("\n") + "\n", "Review.md": review.join("\n") + "\n" };
}

export function saveState(root, state) {
  const notes = renderNotes(state);
  // Refuse to overwrite a user's existing, independently authored notes.
  for (const name of Object.keys(notes)) {
    const path = join(root, name);
    if (existsSync(path) && !readFileSync(path, "utf8").startsWith(marker)) {
      throw new Error(`${name} already exists and is not a generated learning note; preserved it.`);
    }
  }
  const dir = join(root, ".pi");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "learning-state.json");
  const temporary = path + `.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
  for (const [name, content] of Object.entries(notes)) writeFileSync(join(root, name), content);
}

export function recordEvidence(root, input, now = new Date()) {
  for (const key of ["topic", "concept", "evidence", "nextStep", "reviewQuestion", "expectedAnswer"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) throw new Error(`Missing ${key}`);
    if (input[key].length > 3000) throw new Error(`${key} is too long; keep the record concise.`);
  }
  if (!["correct", "incorrect", "unsure", "introduced"].includes(input.outcome)) throw new Error("Invalid outcome");
  const state = loadState(root);
  const key = JSON.stringify([input.topic.trim().toLocaleLowerCase(), input.concept.trim().toLocaleLowerCase()]);
  const prior = state.concepts[key];
  const today = day(now);
  const laterCorrect = input.outcome === "correct" && prior
    && ["demonstrated", "retained"].includes(prior.status) && today > prior.lastChecked;
  const successStage = input.outcome === "correct"
    ? Math.min((prior?.successStage ?? 0) + (laterCorrect ? 1 : 0), intervals.length - 1) : 0;
  const status = input.outcome === "correct" ? (laterCorrect ? "retained" : "demonstrated")
    : input.outcome === "introduced" ? "introduced" : "needs practice";
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + intervals[successStage]);
  const record = {
    topic: input.topic.trim(), concept: input.concept.trim(), status, successStage,
    evidence: input.evidence.trim(), misconception: input.misconception?.trim() ?? "",
    nextStep: input.nextStep.trim(), reviewQuestion: input.reviewQuestion.trim(),
    expectedAnswer: input.expectedAnswer.trim(), lastChecked: today, nextReview: day(next),
    history: [...(prior?.history ?? []), { date: today, outcome: input.outcome, evidence: input.evidence.trim() }].slice(-8),
  };
  state.concepts[key] = record;
  saveState(root, state);
  return record;
}

export function memorySummary(root, now = new Date()) {
  const state = loadState(root);
  const today = day(now);
  const rows = Object.values(state.concepts);
  const due = rows.filter((row) => row.nextReview <= today).slice(0, 5);
  const recent = [...rows].sort((a, b) => b.lastChecked.localeCompare(a.lastChecked)).slice(0, 6);
  const learner = join(root, "Learner.md");
  return [`Today: ${today}.`,
    existsSync(learner) ? "Learner goals/preferences:\n" + readFileSync(learner, "utf8").slice(0, 2000) : "",
    "Recent learning evidence:\n" + (recent.map((row) => `${row.topic} / ${row.concept}: ${row.status}. Evidence: ${row.evidence}. Gap: ${row.misconception}. Next: ${row.nextStep}`).join("\n") || "No evidence yet."),
    "Due reviews (offer up to three, unless the learner wants to skip):\n" + (due.map((row) => `${row.topic} / ${row.concept}: ${row.reviewQuestion}`).join("\n") || "None due."),
    "Use learning_record only to record actual observed answers, errors, uncertainty or newly introduced material. Do not invent assessment results. Use saved evidence to inform the teaching skill's assessment; preserve its required foundation checks, planning and teaching steps. This is a continuity summary; read Progress.md or Review.md if more detail is needed.",
  ].filter(Boolean).join("\n\n").slice(0, 6500);
}
