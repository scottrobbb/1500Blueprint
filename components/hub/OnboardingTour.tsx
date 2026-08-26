"use client";

import { useState } from "react";

type Step = { emoji: string; title: string; body: string };

// First-login walkthrough. Explains XP, streaks, daily goals, and the social
// layer, then marks the user onboarded so it never shows again.
export function OnboardingTour({ firstName, dailyTarget }: { firstName: string; dailyTarget: number }) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);

  const steps: Step[] = [
    {
      emoji: "👋",
      title: `Welcome, ${firstName}!`,
      body: "This is your drilling hub. Here's the 30-second tour of how you level up.",
    },
    {
      emoji: "⚡",
      title: "Earn XP on everything",
      body: "Every drill and practice test you finish earns XP. As your XP fills the level bar, your level climbs.",
    },
    {
      emoji: "🔥",
      title: "Keep your streak alive",
      body: "Practice at least once a day to grow your streak. Miss a day and the flame resets to zero, so the trick is simple: keep showing up.",
    },
    {
      emoji: "🎯",
      title: "Hit your daily goal",
      body: `Finish ${dailyTarget} drills a day to complete your daily goal and lock in your streak for the day. The ring on your stats card tracks it.`,
    },
    {
      emoji: "🏆",
      title: "Compete and collect",
      body: "Climb the weekly leaderboard (it resets every Sunday) and unlock 65 achievement badges as you hit milestones. Now go earn some XP.",
    },
  ];

  if (!open) return null;

  const isLast = step === steps.length - 1;
  const current = steps[step];

  async function finish() {
    setOpen(false);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // Non-blocking: worst case the tour shows once more next visit.
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-[linear-gradient(135deg,#0b2a5b,#1b46a8)] px-7 pb-6 pt-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
            {current.emoji}
          </div>
          <h2 className="mt-4 font-display text-2xl font-extrabold text-white">{current.title}</h2>
        </div>

        <div className="px-7 pb-7 pt-5">
          <p className="min-h-[72px] text-center text-[15px] leading-[1.6] text-navy/70">{current.body}</p>

          <div className="mt-5 flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: i === step ? 22 : 7,
                  background: i === step ? "#3fa9f5" : "rgba(11,42,91,0.18)",
                }}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={finish}
              className="text-sm font-semibold text-navy/45 transition-colors hover:text-navy/70"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-7 text-[15px] font-bold text-navy shadow-lg shadow-gold/20 transition-colors hover:bg-gold-600"
            >
              {isLast ? "Start drilling" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
