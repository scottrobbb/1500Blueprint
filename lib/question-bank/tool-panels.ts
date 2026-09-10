// Which of the question runner's tool panels are open.
//
// These used to live in one slot, so opening the calculator closed the
// reference sheet and vice versa. Nothing about the panels requires that: the
// calculator docks to the side and moves the question over, and the reference
// sheet is a non-modal floating panel (aria-modal="false") that can sit
// anywhere the student drags it. Neither covers the other, and reaching for a
// formula and a graph at the same time is the ordinary way to work a geometry
// question.
//
// Directions is the exception. It is a full-screen modal with a backdrop, so
// anything left open underneath is invisible; it takes the screen alone.

export type ToolPanel = "calculator" | "reference" | "directions";

export const EXCLUSIVE_TOOL: ToolPanel = "directions";

// Clicking a tool that is already open closes it, which is what makes each
// toolbar button a toggle.
export function toggleToolPanel(
  open: ReadonlySet<ToolPanel>,
  tool: ToolPanel,
): Set<ToolPanel> {
  const next = new Set(open);
  if (next.has(tool)) {
    next.delete(tool);
    return next;
  }
  if (tool === EXCLUSIVE_TOOL) return new Set<ToolPanel>([tool]);
  next.delete(EXCLUSIVE_TOOL);
  next.add(tool);
  return next;
}
