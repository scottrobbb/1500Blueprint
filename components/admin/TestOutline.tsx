"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminModule, AdminQuestion, AdminTest } from "@/lib/sat/admin-queries";
import { MathText } from "@/components/test/MathText";
import { label, secondaryBtn } from "@/components/drills/shared/ui";

// The module-by-module question tree for one test. Each module lists its
// questions (linking to the question editor) and can append a new blank one.
// Deleting a question lives in the editor itself, mirroring the drill CMS.

export function TestOutline({ test, basePath = "/admin/tests" }: { test: AdminTest; basePath?: string }) {
  const router = useRouter();
  const [creatingIn, setCreatingIn] = useState<string | null>(null);

  async function addQuestion(moduleId: string) {
    if (creatingIn) return;
    setCreatingIn(moduleId);
    try {
      const res = await fetch("/admin/api/test-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId }),
      });
      if (!res.ok) return;
      const q: AdminQuestion = await res.json();
      router.push(`${basePath}/${test.slug}/questions/${q.id}`);
    } finally {
      setCreatingIn(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className={`${label} text-navy/55`}>Content · {test.modules.length} modules</h2>

      {test.modules.map((mod) => (
        <ModuleCard
          key={mod.id}
          slug={test.slug}
          basePath={basePath}
          mod={mod}
          creating={creatingIn === mod.id}
          onAdd={() => addQuestion(mod.id)}
        />
      ))}
    </div>
  );
}

function ModuleCard({
  slug,
  basePath,
  mod,
  creating,
  onAdd,
}: {
  slug: string;
  basePath: string;
  mod: AdminModule;
  creating: boolean;
  onAdd: () => void;
}) {
  const flagged = mod.questions.filter((q) => q.needsReview).length;

  return (
    <section className="overflow-hidden rounded-card border border-navy/15 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-navy/10 bg-mist px-4 py-3">
        <h3 className="font-display text-base font-bold text-navy">{mod.label}</h3>
        <span className="text-[13px] text-navy/50">
          {mod.questions.length} {mod.questions.length === 1 ? "question" : "questions"} · {mod.minutesPerModule} min
        </span>
        {flagged > 0 ? (
          <span className="inline-flex items-center rounded-chip bg-gold/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-600">
            {flagged} needs review
          </span>
        ) : null}
        <button
          type="button"
          onClick={onAdd}
          disabled={creating}
          className={`${secondaryBtn} ml-auto px-3.5 py-1.5 text-[13px]`}
        >
          {creating ? "Adding…" : "+ Add question"}
        </button>
      </header>

      {mod.questions.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-navy/45">No questions in this module yet.</p>
      ) : (
        <ul className="divide-y divide-navy/8">
          {mod.questions.map((q) => (
            <li key={q.id}>
              <Link
                href={`${basePath}/${slug}/questions/${q.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-brand/5"
              >
                <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-md bg-navy/[0.06] font-mono text-[13px] font-bold text-navy/60">
                  {q.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm text-ink">
                    <MathText>{previewText(q)}</MathText>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-navy/50">
                    <span className="uppercase tracking-wide">{q.type === "grid" ? "Grid-in" : "Multiple choice"}</span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{q.difficulty}</span>
                    {q.domain ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{q.domain}</span>
                      </>
                    ) : null}
                    {q.needsReview ? (
                      <span className="inline-flex items-center rounded-chip bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-600">
                        review
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One-line label for a question row: the prompt, falling back to the passage.
function previewText(q: AdminQuestion): string {
  if (q.prompt?.trim()) return q.prompt.trim();
  if (q.passage?.trim()) return q.passage.trim();
  return "(empty question)";
}
