import assert from "node:assert/strict";
import test from "node:test";
import type { StudyPlanTask } from "./generator";
import { rescheduleTasks, sameSchedule } from "./reschedule";

test("moves a task to another day and renumbers the whole week", () => {
  const tasks = week();
  const moved = rescheduleTasks(tasks, { action: "move", taskId: "t2", date: "2026-08-22" });

  assert.deepEqual(moved.map((task) => [task.id, task.date, task.position]), [
    ["t1", "2026-08-20", 1],
    ["t3", "2026-08-21", 2],
    ["t4", "2026-08-22", 3],
    ["t2", "2026-08-22", 4],
  ]);
});

test("a moved task lands after the work already sitting on that day", () => {
  const moved = rescheduleTasks(week(), { action: "move", taskId: "t1", date: "2026-08-21" });
  const day = moved.filter((task) => task.date === "2026-08-21").map((task) => task.id);

  assert.deepEqual(day, ["t2", "t3", "t1"]);
});

test("reordering only swaps neighbours inside the same day", () => {
  const up = rescheduleTasks(week(), { action: "reorder", taskId: "t3", direction: "up" });
  assert.deepEqual(up.filter((task) => task.date === "2026-08-21").map((task) => task.id), ["t3", "t2"]);

  const blocked = rescheduleTasks(week(), { action: "reorder", taskId: "t2", direction: "up" });
  assert.ok(sameSchedule(week(), blocked));

  const acrossDays = rescheduleTasks(week(), { action: "reorder", taskId: "t4", direction: "down" });
  assert.ok(sameSchedule(week(), acrossDays));
});

test("removing a task closes the position gap it leaves behind", () => {
  const remaining = rescheduleTasks(week(), { action: "remove", taskId: "t2" });

  assert.deepEqual(remaining.map((task) => task.id), ["t1", "t3", "t4"]);
  assert.deepEqual(remaining.map((task) => task.position), [1, 2, 3]);
});

test("an unknown task leaves the schedule alone", () => {
  const untouched = rescheduleTasks(week(), { action: "remove", taskId: "missing" });

  assert.ok(sameSchedule(week(), untouched));
});

test("sameSchedule notices a day change even when the order is unchanged", () => {
  const moved = rescheduleTasks(week(), { action: "move", taskId: "t4", date: "2026-08-23" });

  assert.equal(sameSchedule(week(), moved), false);
});

function week(): StudyPlanTask[] {
  return [
    task("t1", "2026-08-20", 1),
    task("t2", "2026-08-21", 2),
    task("t3", "2026-08-21", 3),
    task("t4", "2026-08-22", 4),
  ];
}

function task(id: string, date: string, position: number): StudyPlanTask {
  return {
    id,
    date,
    position,
    kind: "question_bank",
    section: "math",
    skill: "Linear equations",
    title: `${id} set`,
    description: "",
    reason: "",
    href: "/ultimate/bank/math/practice",
    estimatedMinutes: 20,
    targetCount: 10,
    courseLessonId: null,
    testSlug: null,
    progress: { completed: 0, target: 10, percent: 0 },
    completed: false,
  };
}
