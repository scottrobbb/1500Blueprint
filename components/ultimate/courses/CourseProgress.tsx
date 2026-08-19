"use client";

import { useState } from "react";

export function CourseProgress({ lessonId, initialCompleted }: { lessonId: string; initialCompleted: boolean }) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !completed;
    const response = await fetch(`/api/courses/lessons/${lessonId}/completion`, {
      method: next ? "POST" : "DELETE",
    });
    if (response.ok) setCompleted(next);
    setSaving(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold transition-colors disabled:cursor-wait disabled:opacity-60 ${
        completed ? "border border-success/25 bg-success-bg text-success-600" : "bg-brand text-white hover:bg-brand-600"
      }`}
    >
      <CheckIcon className="h-4 w-4" /> {saving ? "Saving…" : completed ? "Lesson complete" : "Mark lesson complete"}
    </button>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
