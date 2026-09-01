"use client";

import { useEffect, useRef, useState } from "react";
import { parseUnderlineMarkup } from "@/lib/sat/formattedText";
import type { Highlight } from "@/lib/sat/highlights";
import { TrashIcon, UnderlineIcon, NoteIcon } from "./icons";

// Re-exported so the many `from "./HighlightablePassage"` import sites keep
// working; the type and its transitions live in lib/sat/highlights.
export type { Highlight } from "@/lib/sat/highlights";

const COLORS = [
  { key: "#fde68a", label: "Yellow highlight" },
  { key: "#bfdbfe", label: "Blue highlight" },
  { key: "#fbcfe8", label: "Pink highlight" },
];

type Props = {
  text: string;
  highlights: Highlight[];
  enabled: boolean;
  onAdd: (h: Highlight) => void;
  onRemove: (start: number, end: number) => void;
  onSetNote: (id: string, note: string) => void;
  className?: string;
};

type Menu = { x: number; y: number; start: number; end: number };
type Editor = { id: string; start: number; end: number; x: number; y: number };

function newId(): string {
  return crypto.randomUUID();
}

function offsetWithin(container: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n === node) return total + offset;
    total += (n.textContent ?? "").length;
    n = walker.nextNode();
  }
  return total + offset;
}

export function HighlightablePassage({
  text,
  highlights,
  enabled,
  onAdd,
  onRemove,
  onSetNote,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState("");

  // Close the selection toolbar on an outside click.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-hl-toolbar]")) setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  // Commit the note when clicking away from the editor.
  useEffect(() => {
    if (!editor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-hl-editor]")) {
        onSetNote(editor.id, draft);
        setEditor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editor, draft, onSetNote]);

  function handleSelection() {
    if (!enabled || !ref.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;
    const start = offsetWithin(ref.current, range.startContainer, range.startOffset);
    const end = offsetWithin(ref.current, range.endContainer, range.endOffset);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (hi - lo < 1) return;
    const rect = range.getBoundingClientRect();
    setMenu({ x: rect.left + rect.width / 2, y: rect.top, start: lo, end: hi });
  }

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  function addHighlight(color: string) {
    if (!menu) return;
    onAdd({ id: newId(), start: menu.start, end: menu.end, color });
    clearSelection();
  }

  function addNote() {
    if (!menu) return;
    const id = newId();
    onAdd({ id, start: menu.start, end: menu.end, color: "#fde68a" });
    setEditor({ id, start: menu.start, end: menu.end, x: menu.x, y: menu.y });
    setDraft("");
    clearSelection();
  }

  function openNote(h: Highlight, x: number, y: number) {
    setEditor({ id: h.id, start: h.start, end: h.end, x, y });
    setDraft(h.note ?? "");
  }

  function saveNote() {
    if (!editor) return;
    onSetNote(editor.id, draft);
    setEditor(null);
  }

  function deleteHighlight() {
    if (!editor) return;
    onRemove(editor.start, editor.end);
    setEditor(null);
  }

  return (
    <>
      <div
        ref={ref}
        onMouseUp={handleSelection}
        className={`whitespace-pre-line font-serif text-[17px] leading-[1.7] text-exam-ink ${className ?? ""}`}
      >
        {renderSegments(text, highlights, openNote)}
      </div>

      {menu && (
        <div
          data-hl-toolbar
          style={{ left: menu.x, top: menu.y - 12 }}
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-full border border-exam-border bg-white px-3 py-2 shadow-xl"
        >
          {COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={c.label}
              onClick={() => addHighlight(c.key)}
              className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{ backgroundColor: c.key }}
            />
          ))}
          <button
            type="button"
            aria-label="Underline"
            onClick={() => addHighlight("underline")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-exam-ink hover:bg-exam-line/30"
          >
            <UnderlineIcon className="h-5 w-5" />
          </button>
          <span className="h-5 w-px bg-exam-border" />
          <button
            type="button"
            aria-label="Add note"
            onClick={addNote}
            className="flex h-7 w-7 items-center justify-center rounded-md text-exam-ink hover:bg-exam-line/30"
          >
            <NoteIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Remove highlight"
            onClick={() => {
              onRemove(menu.start, menu.end);
              clearSelection();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-exam-ink hover:bg-exam-line/30"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {editor && (
        <div
          data-hl-editor
          style={{ left: editor.x, top: editor.y + 10 }}
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border border-exam-border bg-white p-3 shadow-xl"
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Add a note"
            className="w-full resize-none rounded-md border border-exam-border bg-white p-2 text-[14px] leading-snug text-exam-ink outline-none focus:border-exam-blue"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={deleteHighlight}
              className="text-[13px] font-medium text-exam-maroon hover:underline"
            >
              Delete
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md px-3 py-1 text-[13px] font-medium text-exam-ink hover:bg-exam-tint"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNote}
                className="rounded-md bg-exam-blue px-3 py-1 text-[13px] font-semibold text-white hover:bg-exam-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Render the passage as colored <mark> runs, inserting a clickable note marker
// at the end of any highlight that carries note text. Marker elements hold no
// text, so they don't shift selection offsets.
function renderSegments(
  sourceText: string,
  highlights: Highlight[],
  onOpenNote: (h: Highlight, x: number, y: number) => void,
) {
  const formattedSegments = parseUnderlineMarkup(sourceText);
  const text = formattedSegments.map((segment) => segment.text).join("");
  const len = text.length;
  const colorAt = new Array<string | null>(len).fill(null);
  const authorUnderlineAt = new Array<boolean>(len).fill(false);
  let formattedOffset = 0;
  for (const segment of formattedSegments) {
    if (segment.underlined) {
      authorUnderlineAt.fill(true, formattedOffset, formattedOffset + segment.text.length);
    }
    formattedOffset += segment.text.length;
  }
  for (const h of highlights) {
    for (let i = Math.max(0, h.start); i < Math.min(len, h.end); i++) {
      colorAt[i] = h.color;
    }
  }

  const noteAtEnd = new Map<number, Highlight>();
  for (const h of highlights) {
    if (h.note != null && h.note !== "") {
      noteAtEnd.set(Math.min(len, h.end), h);
    }
  }

  const nodes: React.ReactNode[] = [];
  let buf = "";
  let curColor: string | null = null;
  let curAuthorUnderline = false;
  let key = 0;

  const flush = () => {
    if (!buf) return;
    const underlined = curColor === "underline" || curAuthorUnderline;
    if (curColor && curColor !== "underline") {
      nodes.push(
        <mark
          key={key++}
          style={{ backgroundColor: curColor }}
          className={`rounded-[2px] text-exam-ink ${
            underlined ? "underline decoration-2 underline-offset-2" : ""
          }`}
        >
          {buf}
        </mark>,
      );
    } else if (underlined) {
      nodes.push(
        <span key={key++} className="text-exam-ink underline decoration-2 underline-offset-2">
          {buf}
        </span>,
      );
    } else {
      nodes.push(<span key={key++}>{buf}</span>);
    }
    buf = "";
  };

  for (let i = 0; i <= len; i++) {
    const noted = noteAtEnd.get(i);
    if (noted) {
      flush();
      nodes.push(
        <button
          key={key++}
          type="button"
          aria-label="View note"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => onOpenNote(noted, e.clientX, e.clientY)}
          className="ml-0.5 inline-flex -translate-y-1 items-center align-middle text-exam-blue hover:text-exam-blue-600"
        >
          <NoteIcon className="h-3.5 w-3.5" />
        </button>,
      );
      curColor = null;
      curAuthorUnderline = false;
    }
    if (i === len) break;
    const c = colorAt[i];
    const authorUnderline = authorUnderlineAt[i];
    if (c !== curColor || authorUnderline !== curAuthorUnderline) {
      flush();
      curColor = c;
      curAuthorUnderline = authorUnderline;
    }
    buf += text[i];
  }
  flush();

  return nodes;
}
