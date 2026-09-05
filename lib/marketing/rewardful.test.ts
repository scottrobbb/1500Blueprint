import assert from "node:assert/strict";
import test from "node:test";
import { whenReferralResolved } from "./rewardful";

const REFERRAL = "b533bfca-7c70-4dec-9691-e136a8d9a26c";

type ReadyCallback = () => void;

// A window just real enough for the resolver: timers that fire on demand, and
// a Rewardful queue that may never call back at all.
function fakeWindow(options: { rewardful?: boolean; referral?: string } = {}) {
  let ready: ReadyCallback | null = null;
  const timers = new Map<number, () => void>();
  let nextTimer = 1;

  const win = {
    setTimeout: (fn: () => void) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => { timers.delete(id); },
    rewardful: options.rewardful === false
      ? undefined
      : (_action: string, callback: ReadyCallback) => { ready = callback; },
    Rewardful: options.referral === undefined ? undefined : { referral: options.referral },
  };

  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = win;
  return {
    fireReady: () => ready?.(),
    fireTimeout: () => { for (const fn of [...timers.values()]) fn(); },
    pendingTimers: () => timers.size,
    restore: () => { (globalThis as { window?: unknown }).window = original; },
  };
}

test("a referred visitor resolves to their referral once Rewardful is ready", () => {
  const win = fakeWindow({ referral: REFERRAL });
  try {
    const resolved: Array<string | null> = [];
    whenReferralResolved((value) => resolved.push(value));
    win.fireReady();
    assert.deepEqual(resolved, [REFERRAL]);
    assert.equal(win.pendingTimers(), 0, "the timeout is cleared once an answer arrives");
  } finally {
    win.restore();
  }
});

test("an ordinary visitor resolves to no referral rather than hanging", () => {
  const win = fakeWindow({ referral: "" });
  try {
    const resolved: Array<string | null> = [];
    whenReferralResolved((value) => resolved.push(value));
    win.fireReady();
    assert.deepEqual(resolved, [null]);
  } finally {
    win.restore();
  }
});

test("a blocked rw.js still settles, so checkout is never left waiting", () => {
  const win = fakeWindow({ rewardful: false });
  try {
    const resolved: Array<string | null> = [];
    whenReferralResolved((value) => resolved.push(value));
    assert.deepEqual(resolved, [], "nothing decided while the script might still arrive");
    win.fireTimeout();
    assert.deepEqual(resolved, [null]);
  } finally {
    win.restore();
  }
});

test("a late ready callback cannot submit the form a second time", () => {
  const win = fakeWindow({ referral: REFERRAL });
  try {
    const resolved: Array<string | null> = [];
    whenReferralResolved((value) => resolved.push(value));
    win.fireTimeout();
    win.fireReady();
    assert.deepEqual(resolved, [null], "the timeout already answered; the late referral is ignored");
  } finally {
    win.restore();
  }
});

test("cleanup drops the pending timeout when the component unmounts first", () => {
  const win = fakeWindow({ referral: REFERRAL });
  try {
    const resolved: Array<string | null> = [];
    const cleanup = whenReferralResolved((value) => resolved.push(value));
    cleanup();
    assert.equal(win.pendingTimers(), 0);
    win.fireTimeout();
    assert.deepEqual(resolved, []);
  } finally {
    win.restore();
  }
});
