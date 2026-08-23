import type { PracticeModuleMeta } from "./modules";
import type { PracticeTest, TestModule } from "./types";

export type ModuleAttemptSnapshot = {
  meta: PracticeModuleMeta;
  module: TestModule;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredQuestion(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.prompt !== "string" || typeof value.explanation !== "string") return false;
  if (value.difficulty !== "easy" && value.difficulty !== "medium" && value.difficulty !== "hard") return false;
  if (typeof value.domain !== "string") return false;
  if (value.type === "grid") return Array.isArray(value.acceptedAnswers) && value.acceptedAnswers.every((answer) => typeof answer === "string");
  if (value.type !== "mc" || !Array.isArray(value.choices) || !["A", "B", "C", "D"].includes(String(value.correct))) return false;
  return value.choices.every((choice) => isRecord(choice) && ["A", "B", "C", "D"].includes(String(choice.id)) && typeof choice.text === "string");
}

function isStoredModule(value: unknown, order: 1 | 2): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && value.order === order
    && Array.isArray(value.questions)
    && value.questions.every(isStoredQuestion);
}

/** Validate JSON read from test_attempts before it is trusted by a report page. */
export function parsePracticeTestSnapshot(value: unknown): PracticeTest | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.sections)) return null;
  if (typeof value.breakMinutes !== "number" || !isRecord(value.routeThreshold)) return null;
  if (typeof value.routeThreshold.rw !== "number" || typeof value.routeThreshold.math !== "number") return null;
  const validSections = value.sections.length > 0 && value.sections.every((section) => {
    if (!isRecord(section) || (section.id !== "rw" && section.id !== "math")) return false;
    if (typeof section.name !== "string" || typeof section.shortName !== "string" || typeof section.minutesPerModule !== "number") return false;
    if (!isStoredModule(section.module1, 1) || !isRecord(section.module2)) return false;
    return isStoredModule(section.module2.easy, 2) && isStoredModule(section.module2.hard, 2);
  });
  if (!validSections) return null;
  const sectionIds = value.sections.map((section) => (section as UnknownRecord).id);
  if (new Set(sectionIds).size !== sectionIds.length) return null;
  return value as PracticeTest;
}

/** Validate the compact immutable module form stored with a module attempt. */
export function parseModuleAttemptSnapshot(value: unknown): ModuleAttemptSnapshot | null {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.module)) return null;
  const meta = value.meta;
  if (
    typeof meta.key !== "string"
    || (meta.sectionId !== "rw" && meta.sectionId !== "math")
    || typeof meta.sectionName !== "string"
    || (meta.order !== 1 && meta.order !== 2)
    || typeof meta.label !== "string"
    || typeof meta.fullLabel !== "string"
    || typeof meta.questionCount !== "number"
    || typeof meta.minutes !== "number"
  ) return null;
  if (meta.variant !== undefined && meta.variant !== "easy" && meta.variant !== "hard") return null;
  if (!isStoredModule(value.module, meta.order)) return null;
  return value as ModuleAttemptSnapshot;
}
