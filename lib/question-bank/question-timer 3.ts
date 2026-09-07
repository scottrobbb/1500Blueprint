// How long a student actually spent on a question, with paused time excluded.
//
// This used to be one subtraction, `Date.now() - enteredQuestionAt`, which is
// wall clock: pausing for six minutes and then answering in two recorded eight.
// Pausing has to bank the time run so far and stop counting, so the clock is a
// running total plus, while it is running, the segment in progress.
//
// Kept pure and parameterised on `now` so the transitions can be exercised
// without a clock, and so one reading of the clock drives both the display and
// the duration written with the attempt -- they cannot disagree.

export type QuestionTimer = {
  // Milliseconds banked from segments that have already ended.
  accumulatedMs: number;
  // When the segment in progress began, or null while paused.
  runningSince: number | null;
};

export function startQuestionTimer(now: number): QuestionTimer {
  return { accumulatedMs: 0, runningSince: now };
}

export function pauseQuestionTimer(timer: QuestionTimer, now: number): QuestionTimer {
  // Pausing an already-paused clock must not bank a second segment.
  if (timer.runningSince === null) return timer;
  return {
    accumulatedMs: timer.accumulatedMs + elapsedSince(timer.runningSince, now),
    runningSince: null,
  };
}

export function resumeQuestionTimer(timer: QuestionTimer, now: number): QuestionTimer {
  // Resuming a running clock would otherwise discard the segment in progress.
  if (timer.runningSince !== null) return timer;
  return { ...timer, runningSince: now };
}

export function questionTimerElapsedMs(timer: QuestionTimer, now: number): number {
  const running = timer.runningSince === null ? 0 : elapsedSince(timer.runningSince, now);
  return timer.accumulatedMs + running;
}

// A clock that jumps backwards -- a system time change, or an NTP correction
// mid-question -- must not subtract from the total.
function elapsedSince(start: number, now: number): number {
  return Math.max(0, now - start);
}
