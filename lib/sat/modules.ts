// Helpers for "practice a single module" (e.g. just the hard Math Module 2).
// A stable string key identifies each of a test's six modules so it can live in
// a URL: rw-1, rw-2-easy, rw-2-hard, math-1, math-2-easy, math-2-hard.

import type { ModuleVariant, PracticeTest, Section, SectionId, TestModule } from "./types";

export type PracticeModuleMeta = {
  key: string;
  sectionId: SectionId;
  sectionName: string;
  order: 1 | 2;
  variant?: ModuleVariant;
  label: string; // "Module 1" | "Module 2 · Hard"
  fullLabel: string; // "Math — Module 2 (Hard)"
  questionCount: number;
  minutes: number;
};

const ORDERS: ReadonlyArray<readonly [1 | 2, ModuleVariant | undefined]> = [
  [1, undefined],
  [2, "easy"],
  [2, "hard"],
];

export function moduleKey(sectionId: SectionId, order: 1 | 2, variant?: ModuleVariant): string {
  return order === 1 ? `${sectionId}-1` : `${sectionId}-2-${variant}`;
}

function moduleFor(section: Section, order: 1 | 2, variant?: ModuleVariant): TestModule {
  return order === 1 ? section.module1 : section.module2[variant ?? "easy"];
}

function metaFor(section: Section, order: 1 | 2, variant?: ModuleVariant): PracticeModuleMeta {
  const mod = moduleFor(section, order, variant);
  const variantLabel = variant === "hard" ? "Hard" : "Easy";
  return {
    key: moduleKey(section.id, order, variant),
    sectionId: section.id,
    sectionName: section.name,
    order,
    variant,
    label: order === 1 ? "Module 1" : `Module 2 · ${variantLabel}`,
    fullLabel:
      order === 1
        ? `${section.name}: Module 1`
        : `${section.name}: Module 2 (${variantLabel})`,
    questionCount: mod.questions.length,
    minutes: section.minutesPerModule,
  };
}

export function listPracticeModules(test: PracticeTest): PracticeModuleMeta[] {
  return test.sections.flatMap((section) =>
    ORDERS.map(([order, variant]) => metaFor(section, order, variant)),
  );
}

export function getModuleByKey(
  test: PracticeTest,
  key: string,
): { section: Section; module: TestModule; meta: PracticeModuleMeta } | null {
  for (const section of test.sections) {
    for (const [order, variant] of ORDERS) {
      if (moduleKey(section.id, order, variant) === key) {
        return { section, module: moduleFor(section, order, variant), meta: metaFor(section, order, variant) };
      }
    }
  }
  return null;
}
