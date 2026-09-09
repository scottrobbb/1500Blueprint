import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceReading,
  initialReadingState,
  type ReadingAction,
} from "./state";
import {
  choiceFlags,
  passageWords,
  readingTopic,
  suggestedOrder,
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
  if (round === 2) {
    r.act({ type: "next" });
    r.act({ type: "next" });
  }
  r.act({ type: "order", order: suggestedOrder(r.questions[0], round === 2) });
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

test("guided reading enforces prediction, ordering, and every word before a decision", () => {
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
  r.act({ type: "next" });
  assert.equal(r.state.progress[0].step, "order");
  r.act({ type: "order", order: ["A", "B", "C", "D"] });
  r.act({ type: "next" });
  assert.equal(r.state.progress[0].step, "crossout");
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

test("uncertainty returns to deferred choices without discarding the prediction", () => {
  const r = run();
  toChoices(r, 2);
  assert.deepEqual(r.state.progress[0].order, ["B", "C", "D"]);
  finishChoices(r);
  r.act({ type: "uncertain" });
  assert.equal(r.state.progress[0].step, "choice");
  assert.equal(r.state.progress[0].order[r.state.progress[0].choiceIndex], "A");
  assert.equal(r.state.progress[0].deferred, true);
  assert.ok(r.state.progress[0].prediction);
});

test("timing follows real choice IDs after reordering and preserves subsecond durations", () => {
  const r = run();
  toChoices(r, 2);
  r.act({ type: "time", ms: 225 });
  r.act({ type: "next" });
  r.act({ type: "time", ms: 450 });
  assert.deepEqual(r.state.progress[0].wordMs.B, [225, 450]);
  assert.equal(r.state.progress[0].wordMs.A, undefined);
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

test("flags use whole words, repeated-word exceptions, and red precedence", () => {
  const q = question();
  q.choices = [
    { id: "A", text: "Most plants may grow." },
    { id: "B", text: "Most flowers." },
    { id: "C", text: "Other sources may help." },
    { id: "D", text: "Smothering happens." },
  ];
  const flags = choiceFlags(q);
  assert.equal(flags.A.flag, "neutral");
  assert.equal(flags.C.flag, "red");
  assert.equal(flags.D.flag, "neutral");
  assert.ok(flags.A.repeated.includes("most"));
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
