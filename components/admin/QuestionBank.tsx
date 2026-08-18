"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AnswerType,
  DrillConfig,
  DrillContent,
  DrillQuestion,
  DrillSlug,
  QuestionStatus,
  SatSection,
  SatSkill,
} from "@/lib/drills/types";
import type { Difficulty } from "@/lib/sat/types";
import { MathText } from "@/components/test/MathText";
import { label, primaryBtn, secondaryBtn } from "@/components/drills/shared/ui";

// The question-bank screen: a filter bar across the top, a "+ New question"
// control, the results table, and pagination. Filter state lives here; every
// change refetches via GET /admin/api/questions. The server hands us page 1 so
// the first paint is data-complete; later pages/filters come from the API.

const PAGE_SIZE = 25;

type Filters = {
  drillSlug: string;
  section: string;
  skill: string;
  difficulty: string;
  answerType: string;
  status: string;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  drillSlug: "",
  section: "",
  skill: "",
  difficulty: "",
  answerType: "",
  status: "",
  search: "",
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const STATUSES: QuestionStatus[] = ["draft", "published"];
const SECTIONS: { value: SatSection; label: string }[] = [
  { value: "rw", label: "Reading & Writing" },
  { value: "math", label: "Math" },
];
const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  mc_single: "Multiple choice",
  grid_in: "Grid-in",
  multi_select: "Multi-select",
  free_text: "Free text",
  spaced_repetition: "Spaced repetition",
};

export function QuestionBank({
  initialQuestions,
  total: initialTotal,
  drills,
  skills,
  basePath = "/admin",
}: {
  initialQuestions: DrillQuestion[];
  total: number;
  drills: DrillConfig[];
  skills: SatSkill[];
  basePath?: string;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [questions, setQuestions] = useState<DrillQuestion[]>(initialQuestions);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDrill, setNewDrill] = useState<DrillSlug | "">("");

  const drillTitleBySlug = useMemo(
    () => new Map(drills.map((d) => [d.slug, d.title])),
    [drills],
  );

  // Skills constrained to the chosen section (the bank filters by skill name).
  const sectionSkills = useMemo(() => {
    const list = filters.section
      ? skills.filter((s) => s.section === filters.section)
      : skills;
    return list.slice().sort((a, b) => a.sort - b.sort);
  }, [skills, filters.section]);

  // Refetch whenever filters or page change. Skip the very first render so we
  // keep the server-provided initial data (and don't double-fetch on mount).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    setLoading(true);
    fetch(`/admin/api/questions?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { questions: [], total: 0 }))
      .then((data: { questions: DrillQuestion[]; total: number }) => {
        setQuestions(data.questions);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setQuestions([]);
          setTotal(0);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [filters, page]);

  function setFilter(patch: Partial<Filters>) {
    setPage(1);
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      // Changing section invalidates a skill that no longer belongs to it.
      if (patch.section !== undefined) next.skill = "";
      return next;
    });
  }

  async function onCreate() {
    if (!newDrill || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/admin/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drillSlug: newDrill }),
      });
      if (!res.ok) return;
      const question: DrillQuestion = await res.json();
      router.push(`${basePath}/questions/${question.id}`);
    } finally {
      setCreating(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">
            Question Bank
          </h1>
          <p className="mt-0.5 text-sm text-navy/55">
            {loading ? "Loading…" : `${total} question${total === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={newDrill}
            onChange={(e) => setNewDrill(e.target.value as DrillSlug | "")}
            className={selectClass}
            aria-label="New question drill"
          >
            <option value="">Choose a drill…</option>
            {drills.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreate}
            disabled={!newDrill || creating}
            className={primaryBtn}
          >
            {creating ? "Creating…" : "+ New question"}
          </button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        drills={drills}
        sectionSkills={sectionSkills}
        setFilter={setFilter}
      />

      <ResultsTable
        questions={questions}
        loading={loading}
        drillTitleBySlug={drillTitleBySlug}
        onRowClick={(id) => router.push(`${basePath}/questions/${id}`)}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        onPage={setPage}
        loading={loading}
      />
    </div>
  );
}

// ---- Filter bar -----------------------------------------------------------

function FilterBar({
  filters,
  drills,
  sectionSkills,
  setFilter,
}: {
  filters: Filters;
  drills: DrillConfig[];
  sectionSkills: SatSkill[];
  setFilter: (patch: Partial<Filters>) => void;
}) {
  return (
    <div className="rounded-card border border-navy/15 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilterField labelText="Drill">
          <select
            value={filters.drillSlug}
            onChange={(e) => setFilter({ drillSlug: e.target.value })}
            className={selectClass}
          >
            <option value="">All drills</option>
            {drills.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.title}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Section">
          <select
            value={filters.section}
            onChange={(e) => setFilter({ section: e.target.value })}
            className={selectClass}
          >
            <option value="">All sections</option>
            {SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Skill">
          <select
            value={filters.skill}
            onChange={(e) => setFilter({ skill: e.target.value })}
            className={selectClass}
          >
            <option value="">All skills</option>
            {sectionSkills.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Difficulty">
          <select
            value={filters.difficulty}
            onChange={(e) => setFilter({ difficulty: e.target.value })}
            className={selectClass}
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {capitalize(d)}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Answer type">
          <select
            value={filters.answerType}
            onChange={(e) => setFilter({ answerType: e.target.value })}
            className={selectClass}
          >
            <option value="">Any type</option>
            {(Object.keys(ANSWER_TYPE_LABELS) as AnswerType[]).map((t) => (
              <option key={t} value={t}>
                {ANSWER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Status">
          <select
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value })}
            className={selectClass}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField labelText="Search" className="sm:col-span-2 lg:col-span-3">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder="Search stem or passage text…"
            className={inputClass}
          />
        </FilterField>
      </div>
    </div>
  );
}

function FilterField({
  labelText,
  className,
  children,
}: {
  labelText: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className={`${label} mb-1.5 block text-navy/55`}>{labelText}</span>
      {children}
    </div>
  );
}

// ---- Results table --------------------------------------------------------

function ResultsTable({
  questions,
  loading,
  drillTitleBySlug,
  onRowClick,
}: {
  questions: DrillQuestion[];
  loading: boolean;
  drillTitleBySlug: Map<DrillSlug, string>;
  onRowClick: (id: string) => void;
}) {
  if (!loading && questions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-navy/20 bg-mist px-4 py-12 text-center text-sm text-navy/45">
        No questions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-navy/10 bg-mist">
            <Th className="w-[34%]">Question</Th>
            <Th>Drill</Th>
            <Th>Skill</Th>
            <Th>Difficulty</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Updated</Th>
          </tr>
        </thead>
        <tbody className={loading ? "opacity-50" : ""}>
          {questions.map((q) => (
            <tr
              key={q.id}
              onClick={() => onRowClick(q.id)}
              className="cursor-pointer border-b border-navy/8 transition-colors last:border-b-0 hover:bg-brand/5"
            >
              <Td className="max-w-[360px]">
                <span className="line-clamp-2 text-ink">
                  <MathText>{previewText(q)}</MathText>
                </span>
              </Td>
              <Td className="whitespace-nowrap text-navy/70">
                {drillTitleBySlug.get(q.drillSlug) ?? q.drillSlug}
              </Td>
              <Td className="text-navy/60">{q.skill ?? "—"}</Td>
              <Td className="whitespace-nowrap text-navy/60">{capitalize(q.difficulty)}</Td>
              <Td className="whitespace-nowrap text-navy/60">
                {ANSWER_TYPE_LABELS[q.answerType]}
              </Td>
              <Td>
                <StatusPill status={q.status} />
              </Td>
              <Td className="whitespace-nowrap text-navy/50">{formatDate(q.updatedAt)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-navy/45 ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className ?? ""}`}>{children}</td>;
}

function StatusPill({ status }: { status: QuestionStatus }) {
  const published = status === "published";
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        published ? "bg-success-bg text-success-600" : "bg-navy/8 text-navy/55"
      }`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

// ---- Pagination -----------------------------------------------------------

function Pagination({
  page,
  pageCount,
  total,
  onPage,
  loading,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
  loading: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-navy/55">
        Page {page} of {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
          className={secondaryBtn}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount || loading}
          className={secondaryBtn}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ---- Helpers --------------------------------------------------------------

const selectClass =
  "w-full appearance-none rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15";

// Best-effort one-line label for the row. Prefers the stem; falls back to the
// drill-specific content text (word / definition) so vocab/flashcards rows that
// have no stem still read meaningfully.
function previewText(q: DrillQuestion): string {
  if (q.stem?.trim()) return q.stem.trim();
  const fromContent = contentLabel(q.content);
  if (fromContent) return fromContent;
  if (q.passage?.trim()) return q.passage.trim();
  return "(untitled question)";
}

function contentLabel(content: DrillContent): string | null {
  const c = content as Record<string, unknown>;
  if (typeof c.word === "string" && c.word.trim()) {
    const pos = typeof c.pos === "string" && c.pos ? ` (${c.pos})` : "";
    return `${c.word}${pos}`;
  }
  if (typeof c.definition === "string" && c.definition.trim()) return c.definition;
  if (Array.isArray(c.body) && typeof c.body[0] === "string") return c.body[0];
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
