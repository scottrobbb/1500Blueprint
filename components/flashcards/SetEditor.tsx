"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DrillShell } from "@/components/drills/shared/DrillShell";
import { accentBtn, label, secondaryBtn } from "@/components/drills/shared/ui";
import { MathText } from "@/components/test/MathText";
import type { CardInput, SetVisibility } from "@/lib/flashcards/types";
import { GlobeIcon, GripIcon, ImageIcon, LockIcon, PlusIcon, TrashIcon } from "./icons";

type EditorCard = {
  key: string;
  term: string;
  definition: string;
  termImageUrl: string | null;
  definitionImageUrl: string | null;
};

type SetEditorProps = {
  mode: "create" | "edit";
  setId?: string;
  initial?: {
    title: string;
    description: string;
    visibility: SetVisibility;
    cards: CardInput[];
  };
  allowSharing: boolean;
  backHref: string;
  // Where to navigate after a successful save: `${viewBase}/${id}`.
  viewBase?: string;
  variant?: "default" | "ultimate";
};

function newKey(): string {
  return crypto.randomUUID();
}

function toEditorCards(cards: CardInput[]): EditorCard[] {
  const source = cards.length > 0 ? cards : [{ term: "", definition: "" }, { term: "", definition: "" }];
  return source.map((c) => ({
    key: newKey(),
    term: c.term,
    definition: c.definition,
    termImageUrl: c.termImageUrl ?? null,
    definitionImageUrl: c.definitionImageUrl ?? null,
  }));
}

export function SetEditor({
  mode,
  setId,
  initial,
  allowSharing,
  backHref,
  viewBase = "/flashcards",
  variant = "default",
}: SetEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<SetVisibility>(initial?.visibility ?? "private");
  const [cards, setCards] = useState<EditorCard[]>(() => toEditorCards(initial?.cards ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const filledCount = useMemo(
    () => cards.filter((c) => c.term.trim() || c.definition.trim()).length,
    [cards],
  );

  function updateCard(i: number, patch: Partial<EditorCard>) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCard() {
    setCards((prev) => [
      ...prev,
      { key: newKey(), term: "", definition: "", termImageUrl: null, definitionImageUrl: null },
    ]);
  }
  function removeCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
  }
  function move(from: number, to: number) {
    setCards((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }
  function onDrop(i: number) {
    if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
    setDragIndex(null);
    setOverIndex(null);
  }

  async function save() {
    if (!title.trim()) {
      setError("Give your set a title.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title,
      description: description.trim() || null,
      visibility,
      cards: cards.map((c) => ({
        term: c.term,
        definition: c.definition,
        termImageUrl: c.termImageUrl,
        definitionImageUrl: c.definitionImageUrl,
      })),
    };
    const res =
      mode === "create"
        ? await fetch("/api/flashcards/sets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/flashcards/sets/${setId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    if (!res.ok) {
      setSaving(false);
      setError("Could not save. Please try again.");
      return;
    }
    const id = mode === "create" ? ((await res.json()) as { id: string }).id : setId;
    router.push(`${viewBase}/${id}`);
    router.refresh();
  }

  const saveButton = (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm font-medium text-navy/45 sm:inline">
        {filledCount} {filledCount === 1 ? "card" : "cards"}
      </span>
      <button type="button" onClick={save} disabled={saving} className={accentBtn}>
        {saving ? "Saving…" : mode === "create" ? "Create set" : "Save"}
      </button>
    </div>
  );

  const content = (
      <div className="mx-auto max-w-3xl">
        {/* Set meta */}
        <div className="rounded-card border border-navy/15 bg-white p-5 shadow-pop sm:p-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Set title, e.g. Unit 5 Vocabulary"
            aria-label="Set title"
            className="w-full border-0 border-b-2 border-navy/15 bg-transparent pb-2 font-display text-2xl font-extrabold text-navy placeholder:text-navy/25 focus:border-brand focus:outline-none focus:ring-0"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description (optional)"
            aria-label="Set description"
            className="mt-4 w-full border-0 border-b border-navy/15 bg-transparent pb-1.5 text-sm text-navy placeholder:text-navy/30 focus:border-brand focus:outline-none focus:ring-0"
          />

          {allowSharing ? (
            <div className="mt-5">
              <div className={`${label} mb-2 text-navy/50`}>Visibility</div>
              <div className="inline-flex rounded-card border border-navy/15 bg-white p-0.5">
                <VisibilityOption
                  active={visibility === "private"}
                  onClick={() => setVisibility("private")}
                >
                  <LockIcon className="h-4 w-4" />
                  Private
                </VisibilityOption>
                <VisibilityOption
                  active={visibility === "shared"}
                  onClick={() => setVisibility("shared")}
                >
                  <GlobeIcon className="h-4 w-4" />
                  Shared with all students
                </VisibilityOption>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-card border border-danger/30 bg-danger-bg px-4 py-2.5 text-sm font-medium text-danger-600">
            {error}
          </p>
        ) : null}

        {/* Cards */}
        <div className="mb-1 mt-7 flex items-center gap-2">
          <h2 className={`${label} text-navy/55`}>Cards</h2>
          <span className="rounded-chip bg-navy/6 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-navy/50">
            {cards.length}
          </span>
        </div>
        <p className="mb-3 text-xs text-navy/45">
          Wrap math in <code className="rounded bg-navy/[0.06] px-1 font-mono text-[11px]">$…$</code> for LaTeX
          (e.g. <code className="rounded bg-navy/[0.06] px-1 font-mono text-[11px]">$x^2$</code>), and add an image
          to either side.
        </p>

        <ul className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <li
              key={card.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={() => onDrop(i)}
              className={`rounded-card border bg-white transition-shadow ${
                overIndex === i && dragIndex !== null ? "border-brand ring-2 ring-brand/30" : "border-navy/15"
              } ${dragIndex === i ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between border-b border-navy/8 px-3 py-1.5">
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      move(i, i - 1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      move(i, i + 1);
                    }
                  }}
                  aria-label={`Reorder card ${i + 1}. Use the arrow up and down keys to move it.`}
                  className="flex cursor-grab items-center gap-2 rounded-chip px-1 py-1 text-navy/35 hover:text-navy/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:cursor-grabbing"
                >
                  <GripIcon className="h-4 w-4" />
                  <span className="text-[11px] font-bold tabular-nums">{i + 1}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(i)}
                  aria-label={`Delete card ${i + 1}`}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-chip text-navy/35 transition-colors hover:bg-danger-bg hover:text-danger-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-5 p-4 sm:grid-cols-2">
                <CardField
                  value={card.term}
                  onChange={(v) => updateCard(i, { term: v })}
                  imageUrl={card.termImageUrl}
                  onImageChange={(url) => updateCard(i, { termImageUrl: url })}
                  fieldLabel="Term"
                  placeholder="Term"
                />
                <CardField
                  value={card.definition}
                  onChange={(v) => updateCard(i, { definition: v })}
                  imageUrl={card.definitionImageUrl}
                  onImageChange={(url) => updateCard(i, { definitionImageUrl: url })}
                  fieldLabel="Definition"
                  placeholder="Definition"
                />
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={addCard}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-navy/25 bg-white py-3.5 text-sm font-semibold text-navy/60 transition-colors hover:border-brand hover:text-brand"
        >
          <PlusIcon className="h-4 w-4" />
          Add card
        </button>

        <div className="mt-7 flex items-center justify-end gap-3">
          <Link href={backHref} className={secondaryBtn}>
            Cancel
          </Link>
          <button type="button" onClick={save} disabled={saving} className={accentBtn}>
            {saving ? "Saving…" : mode === "create" ? "Create set" : "Save changes"}
          </button>
        </div>
      </div>
  );

  if (variant === "ultimate") {
    return (
      <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
        <header className="mb-5 flex flex-wrap items-center gap-4 rounded-[18px] border border-navy/10 bg-white p-4 shadow-pop sm:p-5">
          <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-navy/55 hover:text-navy">← Back</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Flashcards</p>
            <h1 className="font-display text-2xl font-extrabold text-navy">{mode === "create" ? "Create set" : "Edit set"}</h1>
          </div>
          {saveButton}
        </header>
        {content}
      </div>
    );
  }

  return (
    <DrillShell
      title={mode === "create" ? "Create set" : "Edit set"}
      eyebrow="Flashcards"
      exitHref={backHref}
      exitLabel="Cancel"
      right={saveButton}
    >
      {content}
    </DrillShell>
  );
}

function CardField({
  value,
  onChange,
  imageUrl,
  onImageChange,
  fieldLabel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  fieldLabel: string;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a remove
    if (!file) return;
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/flashcards/upload", { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      setError("Upload failed. Use an image under 5 MB.");
      return;
    }
    const data = (await res.json()) as { url: string };
    onImageChange(data.url);
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        aria-label={fieldLabel}
        className="w-full resize-none border-0 border-b border-navy/20 bg-transparent pb-1.5 font-serif text-[15px] leading-relaxed text-exam-ink placeholder:font-sans placeholder:text-navy/25 focus:border-brand focus:outline-none focus:ring-0"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className={`${label} text-navy/40`}>{fieldLabel}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex cursor-pointer items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-semibold text-navy/45 transition-colors hover:bg-navy/5 hover:text-navy disabled:opacity-50"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : imageUrl ? "Replace" : "Image"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      </div>

      {value.includes("$") && (
        <div className="mt-2 rounded-card border border-navy/10 bg-mist px-3 py-2 text-[13px] leading-relaxed text-exam-ink">
          <span className={`${label} mr-2 text-navy/35`}>Preview</span>
          <MathText>{value}</MathText>
        </div>
      )}

      {error && <p className="mt-1 text-[11px] font-medium text-danger-600">{error}</p>}

      {imageUrl && (
        <div className="mt-2 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${fieldLabel} figure`}
            className="max-h-24 rounded-card border border-navy/15 object-contain"
          />
          <button
            type="button"
            onClick={() => onImageChange(null)}
            aria-label={`Remove ${fieldLabel} image`}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-chip text-navy/40 transition-colors hover:bg-danger-bg hover:text-danger-600"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function VisibilityOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-navy text-white" : "text-navy/55 hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}
