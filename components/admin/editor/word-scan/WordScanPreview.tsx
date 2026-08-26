import type { DrillQuestion, WordScanContent } from "@/lib/drills/types";
import { MathText } from "@/components/test/MathText";
import { labelMuted } from "@/components/drills/shared/ui";

// Read-only, student-faithful render of a word-scan question card. Mirrors the
// playing screen (ChoiceCard) but is non-interactive and pre-reveals which
// choices belong to the flag set so the author can verify the answer key.

function asContent(content: DrillQuestion["content"]): WordScanContent {
  const c = content as Partial<WordScanContent>;
  return {
    mode: c.mode ?? "",
    verbs: c.verbs ?? [],
    choices: c.choices ?? [],
    correct: c.correct ?? [],
  };
}

// The lowercased first word of a choice, used to underline the trigger verb.
function firstWord(text: string): string {
  const match = text.trim().match(/^[A-Za-z]+/);
  return match ? match[0].toLowerCase() : "";
}

function FirstWordMark({ text, verbSet }: { text: string; verbSet: string[] }) {
  const m = text.match(/^(\s*)([A-Za-z]+)([\s\S]*)$/);
  if (!m || !verbSet.includes(firstWord(text))) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="font-bold underline decoration-success/60 underline-offset-2">{m[2]}</span>
      {m[3]}
    </>
  );
}

export function Preview({ question }: { question: DrillQuestion }) {
  const { mode, verbs, choices, correct } = asContent(question.content);
  const verbSet = verbs.map((v) => v.trim().toLowerCase()).filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="text-sm text-navy/65">
          Tap choices that START with a{" "}
          <span className="font-semibold text-navy">{mode || "-"}</span> verb
          {verbSet.length ? <span className="text-navy/45"> ({verbs.join(", ")})</span> : null}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {choices.length === 0 ? (
          <p className={`${labelMuted} text-center`}>No choices yet</p>
        ) : (
          choices.map((choice) => {
            const flagged = correct.includes(choice.id);
            return (
              <div
                key={choice.id}
                className={`flex w-full items-start gap-3.5 rounded-card border px-4 py-3.5 sm:px-5 sm:py-4 ${
                  flagged ? "border-success/40 bg-success-bg ring-1 ring-success/30" : "border-navy/15 bg-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border text-[13px] font-semibold ${
                    flagged ? "border-success bg-success text-white" : "border-navy/20 bg-navy/[0.04] text-navy/55"
                  }`}
                >
                  {choice.id}
                </span>
                <span className="font-serif text-[15px] leading-relaxed text-exam-ink">
                  {flagged ? <FirstWordMark text={choice.text} verbSet={verbSet} /> : <MathText>{choice.text}</MathText>}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
