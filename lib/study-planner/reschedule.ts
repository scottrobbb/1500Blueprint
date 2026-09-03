import type { StudyPlanTask } from "./generator";

export type StudyPlanEdit =
  | { action: "move"; taskId: string; date: string }
  | { action: "reorder"; taskId: string; direction: "up" | "down" }
  | { action: "remove"; taskId: string };

// Applies one manual timeline change and renumbers the whole plan so positions
// stay a gap-free reading order across the week.
export function rescheduleTasks(tasks: StudyPlanTask[], edit: StudyPlanEdit): StudyPlanTask[] {
  const ordered = planOrder(tasks);
  const index = ordered.findIndex((task) => task.id === edit.taskId);
  if (index < 0) return renumber(ordered);

  if (edit.action === "remove") {
    ordered.splice(index, 1);
    return renumber(ordered);
  }

  if (edit.action === "move") {
    const [moved] = ordered.splice(index, 1);
    // Land at the end of the destination day so work already arranged there
    // keeps the order the student put it in.
    const insertAt = ordered.findIndex((task) => task.date > edit.date);
    ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, { ...moved, date: edit.date });
    return renumber(ordered);
  }

  const neighbour = edit.direction === "up" ? index - 1 : index + 1;
  if (neighbour < 0 || neighbour >= ordered.length) return renumber(ordered);
  if (ordered[neighbour].date !== ordered[index].date) return renumber(ordered);
  [ordered[index], ordered[neighbour]] = [ordered[neighbour], ordered[index]];
  return renumber(ordered);
}

export function planOrder(tasks: StudyPlanTask[]): StudyPlanTask[] {
  return [...tasks].sort((left, right) => (
    left.date.localeCompare(right.date) || left.position - right.position
  ));
}

export function sameSchedule(before: StudyPlanTask[], after: StudyPlanTask[]): boolean {
  const source = planOrder(before);
  return source.length === after.length
    && after.every((task, index) => task.id === source[index].id && task.date === source[index].date);
}

function renumber(tasks: StudyPlanTask[]): StudyPlanTask[] {
  return tasks.map((task, index) => ({ ...task, position: index + 1 }));
}
