// Which parts of the course editor the author has collapsed.
//
// Only explicit choices are recorded. A section the author has never touched
// is absent from the map and falls back to whatever default the editor asks
// for, so "the first content block starts open" keeps working without writing
// an entry for every block on load -- and the moment the author collapses that
// block, their choice is what survives.
//
// The editor holds this above the lesson workspace, so a section stays
// collapsed when the author clicks to another lesson or module. The panels
// themselves are keyed by role rather than by lesson id: "I want the lesson
// settings panel out of my way" is a preference about the editor, not about
// one particular lesson.
export type EditorSectionState = Record<string, boolean>;

export const ASSET_INBOX_SECTION = "asset-inbox";
export const COURSE_SETTINGS_SECTION = "course-settings";
export const MODULE_SETTINGS_SECTION = "module-settings";
export const LESSON_SETTINGS_SECTION = "lesson-settings";
export const LESSON_CONTENT_SECTION = "lesson-content";
export const ADD_CONTENT_SECTION = "add-content";

// Content blocks and outline modules are distinct things rather than one
// reusable panel, so each gets its own entry.
export function moduleSection(moduleId: string): string {
  return `module:${moduleId}`;
}

export function blockSection(blockId: string): string {
  return `block:${blockId}`;
}

export function isSectionOpen(
  state: EditorSectionState,
  id: string,
  fallback: boolean,
): boolean {
  return state[id] ?? fallback;
}

export function setSectionOpen(
  state: EditorSectionState,
  id: string,
  open: boolean,
): EditorSectionState {
  if (state[id] === open) return state;
  return { ...state, [id]: open };
}

// Expand-all and collapse-all over the blocks of the lesson in front of the
// author. Written as explicit entries so the result outlives a later default:
// collapsing everything must not leave the first block springing back open.
export function setSectionsOpen(
  state: EditorSectionState,
  ids: readonly string[],
  open: boolean,
): EditorSectionState {
  if (ids.length === 0) return state;
  const next = { ...state };
  for (const id of ids) next[id] = open;
  return next;
}
