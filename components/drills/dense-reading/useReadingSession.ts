"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAsyncQueue } from "@/lib/sat/asyncQueue";
import { advanceReading, type ReadingAction } from "@/lib/dense-reading/state";
import { validateReadingState } from "@/lib/dense-reading/validation";
import type { ReadingSession, ReadingState } from "@/lib/dense-reading/types";

export type ReadingPersistence = (
  state: ReadingState,
  revision: number,
  complete: boolean,
) => Promise<ReadingSession>;

export function useReadingSession(
  initial: ReadingSession,
  persistOverride?: ReadingPersistence,
) {
  const [session, setSession] = useState(initial);
  const [state, setState] = useState(initial.state);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [ready, setReady] = useState(false);
  const current = useRef(initial.state);
  const revision = useRef(initial.revision);
  const finished = useRef(initial.status === "completed");
  const lastTick = useRef(0);
  const queue = useRef(createAsyncQueue());
  const key = `blueprint:dense-reading:${initial.id}`;

  const dispatch = useCallback(
    (action: ReadingAction) => {
      if (finished.current || conflict) return;
      let next = current.current;
      const now = performance.now();
      if (lastTick.current && document.visibilityState === "visible") {
        next = advanceReading(
          next,
          { type: "time", ms: now - lastTick.current },
          initial.questions,
          initial.mode,
        );
      }
      lastTick.current = now;
      if (action.type !== "time")
        next = advanceReading(next, action, initial.questions, initial.mode);
      current.current = next;
      setState(next);
    },
    [initial.mode, initial.questions, conflict],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initial.status === "active") {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.revision === initial.revision) {
              const recovered = validateReadingState(
                saved.state,
                initial.questions,
                initial.mode,
                initial.state,
              );
              current.current = recovered;
              // Recovery happens once after hydration, before the controls are enabled.
              setState(recovered);
            }
          }
        } catch {
          /* A corrupt browser backup does not replace the server save. */
        }
      }
      lastTick.current = performance.now();
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [initial, key]);

  const save = useCallback(
    (complete = false): Promise<boolean> =>
      queue.current.run(async () => {
        if (finished.current) return true;
        if (conflict) return false;
        setSaving(true);
        setError(null);
        try {
          const snapshot = current.current;
          let updated: ReadingSession;
          if (persistOverride)
            updated = await persistOverride(
              snapshot,
              revision.current,
              complete,
            );
          else {
            const response = await fetch(
              `/api/drills/dense-reading/${initial.id}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  revision: revision.current,
                  state: snapshot,
                  complete,
                }),
              },
            );
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.session) {
              if (response.status === 409) setConflict(true);
              throw new Error(
                body?.error ??
                  "Your progress could not be saved. Check your connection and sign-in, then retry.",
              );
            }
            updated = body.session;
          }
          revision.current = updated.revision;
          if (updated.status === "completed") {
            finished.current = true;
            setSession(updated);
            current.current = updated.state;
            setState(updated.state);
            try {
              localStorage.removeItem(key);
            } catch {}
          } else {
            try {
              localStorage.setItem(
                key,
                JSON.stringify({
                  revision: revision.current,
                  state: current.current,
                }),
              );
            } catch {}
          }
          return true;
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Your progress could not be saved.",
          );
          return false;
        } finally {
          setSaving(false);
        }
      }),
    [initial.id, key, conflict, persistOverride],
  );

  useEffect(() => {
    if (!ready || session.status === "completed") return;
    const tick = window.setInterval(
      () => dispatch({ type: "time", ms: 0 }),
      1000,
    );
    const persist = window.setInterval(() => {
      void save();
    }, 15_000);
    const backup = () => {
      lastTick.current = performance.now();
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            revision: revision.current,
            state: current.current,
          }),
        );
      } catch {}
    };
    document.addEventListener("visibilitychange", backup);
    window.addEventListener("pagehide", backup);
    return () => {
      clearInterval(tick);
      clearInterval(persist);
      document.removeEventListener("visibilitychange", backup);
      window.removeEventListener("pagehide", backup);
    };
  }, [dispatch, key, ready, save, session.status]);

  useEffect(() => {
    if (!ready || session.status === "completed" || !state.changes) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ revision: revision.current, state: current.current }),
      );
    } catch {}
    const timeout = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [state.changes, key, ready, save, session.status]);

  return { session, state, dispatch, save, saving, error, conflict, ready };
}
