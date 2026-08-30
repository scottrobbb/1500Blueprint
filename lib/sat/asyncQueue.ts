export type AsyncQueue = {
  run<T>(task: () => Promise<T>): Promise<T>;
};

export function createAsyncQueue(): AsyncQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
