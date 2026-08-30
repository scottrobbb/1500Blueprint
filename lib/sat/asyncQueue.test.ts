import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncQueue } from "./asyncQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("session saves run in request order", async () => {
  const queue = createAsyncQueue();
  const first = deferred<string>();
  const started: string[] = [];

  const firstResult = queue.run(async () => {
    started.push("module-1");
    return first.promise;
  });
  const secondResult = queue.run(async () => {
    started.push("module-2");
    return "module-2";
  });

  await Promise.resolve();
  assert.deepEqual(started, ["module-1"]);
  first.resolve("module-1");
  assert.equal(await firstResult, "module-1");
  assert.equal(await secondResult, "module-2");
  assert.deepEqual(started, ["module-1", "module-2"]);
});

test("a failed save does not block the latest state", async () => {
  const queue = createAsyncQueue();
  await assert.rejects(queue.run(async () => {
    throw new Error("save failed");
  }));
  assert.equal(await queue.run(async () => "latest"), "latest");
});
