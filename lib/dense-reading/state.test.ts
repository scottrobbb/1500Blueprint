import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceReading,
  initialReadingState,
  type ReadingAction,
} from "./state";
import {
  passageWords,
  readingTopic,
} from "./method";
import {
  gradeReading,
  publicReadingQuestion,
  validateReadingState,
} from "./validation";
import type { ReadingKey, ReadingMode } from "./types";

function question(id = "one"): ReadingKey {
  return {
    id,
    topic: "inference",
    difficulty: "medium",
    passage:
      "A researcher measured plants growing beside a shaded wall. Growth was slower there.",
    prompt: "Which choice most logically completes the text?",
    figureUrl: null,
    correct: "C",
    explanation: "Less light corresponded to slower growth.",
    choices: [
      { id: "A", text: "Other causes." },
      { id: "B", text: "Unchanged growth." },
      { id: "C", text: "Reduced light." },
      { id: "D", text: "Faster growth." },
    ],
  };
}

function run(mode: ReadingMode = "guided", count = 1) {
  const questions = Array.from({ length: count }, (_, i) =>
    question(String(i)),
  );
  let state = initialReadingState(count, mode);
  return {
    questions,
    get state() {
      return state;
    },
    act(action: ReadingAction) {
      state = advanceReading(state, action, questions, mode);
      return state;
    },
  };
}
function toChoices(r: ReturnType<typeof run>, round: 1 | 2 = 1) {
  r.act({ type: "solve" });
  r.act({ type: "round", round });
  r.act({ type: "next" });
  r.act({ type: "next" });
  while (r.state.progress[0].step === "passage") r.act({ type: "next" });
  r.act({ type: "prediction", text: "Plants grew more slowly in shade." });
  r.act({ type: "next" });
  r.act({ type: "crossout" });
}
function finishChoices(r: ReturnType<typeof run>) {
  for (let i = 0; i < 30 && r.state.progress[0].step === "choice"; i++) {
    const p = r.state.progress[0];
    r.act({ type: "next" });
    r.act({ type: "decide", keep: p.order[p.choiceIndex] === "C" });
  }
}

test("guided reading enforces the prediction and every word before a decision", () => {
  const r = run();
  r.act({ type: "solve" });
  r.act({ type: "round", round: 1 });
  r.act({ type: "review" });
  assert.equal(r.state.review, false);
  r.act({ type: "next" });
  r.act({ type: "next" });
  while (r.state.progress[0].step === "passage") r.act({ type: "next" });
  r.act({ type: "next" });
  assert.equal(r.state.progress[0].step, "prediction");
  r.act({ type: "prediction", text: "Shade slows growth." });
  r.act({ type: "next" });
  assert.equal(r.state.progress[0].step, "crossout");
  // Choices are checked in the order they are written.
  assert.deepEqual(r.state.progress[0].order, ["A", "B", "C", "D"]);
  r.act({ type: "crossout" });
  r.act({ type: "decide", keep: false });
  assert.equal(r.state.progress[0].choiceIndex, 0);
  finishChoices(r);
  r.act({ type: "next" });
  r.act({ type: "answer", choice: "C" });
  r.act({ type: "next" });
  assert.equal(r.state.review, true);
  assert.equal(r.state.progress[0].submitted, true);
  assert.equal(gradeReading(r.questions, r.state)[0].correct, true);
});

test("submitted guided answers stay locked when revisited", () => {
  const r = run();
  toChoices(r);
  finishChoices(r);
  r.act({ type: "next" });
  r.act({ type: "answer", choice: "C" });
  r.act({ type: "next" });
  r.act({ type: "goto", index: 0 });
  r.act({ type: "answer", choice: "A" });
  assert.equal(r.state.progress[0].answer, "C");
  assert.deepEqual(r.state.attemptOrder, ["0"]);
});

test("skip survives revisiting and does not masquerade as an immediate solve", () => {
  const r = run("guided", 2);
  r.act({ type: "time", ms: 5500 });
  assert.equal(r.state.progress[0].previewMs, 5000);
  r.act({ type: "skip" });
  assert.equal(r.state.current, 1);
  r.act({ type: "review" });
  r.act({ type: "goto", index: 0 });
  toChoices(r);
  finishChoices(r);
  r.act({ type: "next" });
  r.act({ type: "answer", choice: "C" });
  r.act({ type: "next" });
  assert.equal(r.state.progress[0].skipped, true);
  assert.equal(r.state.progress[0].submitted, true);
});

test("uncertainty sends the student back through the passage, keeping the prediction", () => {
  const r = run();
  toChoices(r, 2);
  // Every choice is checked, so there is nothing left to defer.
  assert.deepEqual(r.state.progress[0].order, ["A", "B", "C", "D"]);
  finishChoices(r);
  r.act({ type: "uncertain" });
  assert.equal(r.state.progress[0].step, "topic");
  assert.deepEqual(r.state.progress[0].order, []);
  assert.equal(r.state.progress[0].eliminated.length, 0);
  assert.ok(r.state.progress[0].prediction);
});

test("timing follows the checked choice and preserves subsecond durations", () => {
  const r = run();
  toChoices(r, 2);
  r.act({ type: "time", ms: 225 });
  r.act({ type: "next" });
  r.act({ type: "time", ms: 450 });
  assert.deepEqual(r.state.progress[0].wordMs.A, [225, 450]);
  assert.equal(r.state.progress[0].wordMs.B, undefined);
  assert.equal(r.state.elapsedMs, 675);
});

test("regular mode supports changing answers and free navigation", () => {
  const r = run("regular", 2);
  r.act({ type: "answer", choice: "A" });
  r.act({ type: "next" });
  r.act({ type: "goto", index: 0 });
  r.act({ type: "answer", choice: "C" });
  assert.equal(r.state.progress[0].answer, "C");
  assert.deepEqual(r.state.attemptOrder, ["0"]);
});

test("empty and unanswered questions are graded as incorrect on final submission", () => {
  const r = run("regular");
  assert.equal(gradeReading(r.questions, r.state)[0].correct, false);
  assert.equal(gradeReading(r.questions, r.state)[0].answer, null);
});

test("safe passage tokenization preserves authored underlines and highlight offsets", () => {
  const words = passageWords("An <u>important contrast</u> appears here.");
  assert.equal(words[1].underlined, true);
  assert.equal(words[1].start, 3);
  assert.equal(
    words.map((w) => w.text).join(""),
    "An important contrast appears here.",
  );
});

test("topic selection excludes grammar and handles the supported reading patterns", () => {
  assert.equal(readingTopic("Which choice?", "Boundaries", null), null);
  assert.equal(
    readingTopic(
      "Which choice describes the function of the underlined portion?",
      "Text Structure and Purpose",
      null,
    ),
    "function",
  );
  assert.equal(
    readingTopic(
      "Which data from the table support the claim?",
      "Command of Evidence",
      null,
    ),
    "graphs",
  );
  assert.equal(
    readingTopic(
      "Which choice most logically completes the text?",
      "Inferences",
      null,
    ),
    "inference",
  );
  assert.equal(
    readingTopic(
      "What is the difference between Text 1 and Text 2?",
      "Cross-Text Connections",
      null,
    ),
    "cross-text",
  );
});

test("client questions contain no keys or explanations", () => {
  const q = publicReadingQuestion(question());
  assert.equal("correct" in q, false);
  assert.equal("explanation" in q, false);
  assert.deepEqual(Object.keys(q.choices[0]).sort(), ["id", "text"]);
});

// Guided sessions saved before the flag scan was removed still hold its step
// and its per-choice flags. They have to keep loading.
test("a session saved on a step the flow no longer has resumes at cross-out", () => {
  const r = run();
  const saved = structuredClone(r.state) as unknown as {
    progress: Record<string, unknown>[];
  };
  saved.progress[0] = {
    ...saved.progress[0],
    step: "flags",
    flags: { A: "red", B: "neutral" },
    flagsChecked: true,
    stepMs: { flags: 4200, prediction: 1000 },
  };
  const state = validateReadingState(saved, r.questions, "guided");
  assert.equal(state.progress[0].step, "crossout");
  assert.equal(state.progress[0].prediction, r.state.progress[0].prediction);
  assert.equal(state.progress[0].stepMs.prediction, 1000);
  assert.ok(!("flags" in state.progress[0]));
  assert.ok(!("flagsChecked" in state.progress[0]));
});

// A student part-way through ordering saved a partial order. The choice step
// walks that list, so it has to come back complete.
test("a session saved while ordering resumes with every choice to check", () => {
  const r = run();
  const saved = structuredClone(r.state) as unknown as {
    progress: Record<string, unknown>[];
  };
  saved.progress[0] = { ...saved.progress[0], step: "order", order: ["B", "D"] };
  const state = validateReadingState(saved, r.questions, "guided");
  assert.equal(state.progress[0].step, "crossout");
  assert.deepEqual(state.progress[0].order, ["A", "B", "C", "D"]);
  assert.equal(state.progress[0].choiceIndex, 0);
});

test("save validation rejects forged answers, positions, timings, and highlight payloads", () => {
  const r = run();
  assert.throws(() =>
    validateReadingState({ ...r.state, current: 99 }, r.questions, "guided"),
  );
  const bad = structuredClone(r.state);
  bad.progress[0].elapsedMs = Infinity;
  assert.throws(() => validateReadingState(bad, r.questions, "guided"));
  bad.progress[0].elapsedMs = 1;
  bad.progress[0].highlights = [
    { id: "x", start: 0, end: 1, color: "url(javascript:bad)" },
  ];
  assert.throws(() => validateReadingState(bad, r.questions, "guided"));
  assert.throws(() =>
    validateReadingState(
      { ...r.state, progress: [{ ...r.state.progress[0], answer: "E" }] },
      r.questions,
      "guided",
    ),
  );
});

test("save validation preserves skip history and freezes submitted guided answers", () => {
  const r = run();
  const previous = structuredClone(r.state);
  previous.progress[0].skipped = true;
  assert.equal(
    validateReadingState(r.state, r.questions, "guided", previous).progress[0]
      .skipped,
    true,
  );
  previous.progress[0].answer = "C";
  previous.progress[0].submitted = true;
  assert.throws(
    () => validateReadingState(r.state, r.questions, "guided", previous),
    /cannot be changed/,
  );
});
