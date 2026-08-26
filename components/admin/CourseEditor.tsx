"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auditCourse, type CourseAuditIssue } from "@/lib/courses/audit";
import { emptyCoursePractice } from "@/lib/courses/practice";
import type { Course, CourseInput, CourseLesson, CourseModule, LessonBlock, LessonBlockKind } from "@/lib/courses/types";
import { CourseCover } from "@/components/ultimate/courses/CourseCover";
import { CourseAssetUpload } from "./course-editor/CourseAssetUpload";
import { PracticeBuilder } from "./course-editor/PracticeBuilder";

const inputClass = "mt-1.5 w-full rounded-xl border border-navy/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass = "text-[10px] font-extrabold uppercase tracking-[0.11em] text-navy/45";
const blockKinds: { kind: LessonBlockKind; label: string; description: string }[] = [
  { kind: "text", label: "Text", description: "Instructions, notes, or lesson copy" },
  { kind: "video", label: "Video", description: "Upload or paste Drive, YouTube, or Vimeo" },
  { kind: "file", label: "Resource", description: "PDF, guide, worksheet, or link" },
  { kind: "image", label: "Image", description: "Diagram, screenshot, or reference image" },
  { kind: "practice", label: "Practice", description: "Native MCQ or free-response runner" },
];

function cleanSlug(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function move<T>(items: T[], index: number, direction: -1 | 1): T[] { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; }

export function CourseEditor({ initial }: { initial: Course }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));
  const [selectedLessonId, setSelectedLessonId] = useState(initial.modules[0]?.lessons[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const audit = useMemo(() => auditCourse(course), [course]);
  const dirty = JSON.stringify(course) !== savedSnapshot;
  const selectedLocation = useMemo(() => {
    for (const [moduleIndex, module] of course.modules.entries()) {
      const lessonIndex = module.lessons.findIndex((lesson) => lesson.id === selectedLessonId);
      if (lessonIndex >= 0) return { module, moduleIndex, lesson: module.lessons[lessonIndex], lessonIndex };
    }
    return null;
  }, [course.modules, selectedLessonId]);

  useEffect(() => {
    function preventClose(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);

  useEffect(() => {
    function saveShortcut(event: KeyboardEvent) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  });

  function updateModule(moduleIndex: number, update: Partial<CourseModule>) { setCourse((current) => ({ ...current, modules: current.modules.map((courseModule, index) => index === moduleIndex ? { ...courseModule, ...update } : courseModule) })); }
  function updateLesson(moduleIndex: number, lessonIndex: number, update: Partial<CourseLesson>) { const courseModule = course.modules[moduleIndex]; updateModule(moduleIndex, { lessons: courseModule.lessons.map((lesson, index) => index === lessonIndex ? { ...lesson, ...update } : lesson) }); }
  function updateBlock(moduleIndex: number, lessonIndex: number, blockIndex: number, update: Partial<LessonBlock>) { const lesson = course.modules[moduleIndex].lessons[lessonIndex]; updateLesson(moduleIndex, lessonIndex, { blocks: lesson.blocks.map((block, index) => index === blockIndex ? { ...block, ...update } : block) }); }

  function addModule() {
    const id = crypto.randomUUID();
    setCourse((current) => ({ ...current, modules: [...current.modules, { id, slug: `module-${current.modules.length + 1}`, title: "New module", description: null, position: current.modules.length + 1, status: "draft", lessons: [] }] }));
  }
  function addLesson(moduleIndex: number) {
    const courseModule = course.modules[moduleIndex];
    const id = crypto.randomUUID();
    const lesson: CourseLesson = { id, slug: `lesson-${courseModule.lessons.length + 1}`, title: "New lesson", summary: null, position: courseModule.lessons.length + 1, estimatedMinutes: 10, status: "draft", completed: false, blocks: [] };
    updateModule(moduleIndex, { lessons: [...courseModule.lessons, lesson] });
    setSelectedLessonId(id);
  }
  function removeModule(moduleIndex: number) {
    const courseModule = course.modules[moduleIndex];
    if (!courseModule || !window.confirm(
      `Delete module “${courseModule.title}” and its ${courseModule.lessons.length} lesson${courseModule.lessons.length === 1 ? "" : "s"}? This takes effect when you save the course.`,
    )) return;
    const remaining = course.modules.filter((_, index) => index !== moduleIndex);
    if (courseModule.lessons.some((lesson) => lesson.id === selectedLessonId)) {
      setSelectedLessonId(remaining.flatMap((item) => item.lessons)[0]?.id ?? null);
    }
    setCourse((current) => ({
      ...current,
      modules: current.modules.filter((_, index) => index !== moduleIndex),
    }));
  }
  function addBlock(moduleIndex: number, lessonIndex: number, kind: LessonBlockKind) {
    const lesson = course.modules[moduleIndex].lessons[lessonIndex];
    const content: LessonBlock["content"] = kind === "text" ? { body: "" } : kind === "practice" ? { practice: emptyCoursePractice(`${lesson.title} practice`) } : { url: "", title: "" };
    updateLesson(moduleIndex, lessonIndex, { blocks: [...lesson.blocks, { id: crypto.randomUUID(), position: lesson.blocks.length + 1, kind, content }] });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const input: CourseInput = { id: course.id, slug: cleanSlug(course.slug), title: course.title, description: course.description, eyebrow: course.eyebrow, coverUrl: course.coverUrl, position: course.position, estimatedMinutes: course.estimatedMinutes, status: course.status, modules: course.modules };
    try {
      const response = await fetch(`/api/admin/courses/${course.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const result = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
      if (response.ok) { setSavedSnapshot(JSON.stringify(course)); setMessage({ tone: "success", text: "Course saved. Student content is up to date." }); router.refresh(); }
      else setMessage({ tone: "error", text: result?.detail ?? "The course could not be saved. Check the highlighted content and duplicate slugs." });
    } catch {
      setMessage({ tone: "error", text: "The course could not be saved because the server could not be reached." });
    } finally {
      setSaving(false);
    }
  }

  async function removeCourse() {
    if (!window.confirm(`Delete “${course.title}” and all unused content inside it? Content with student completions or practice attempts must be unpublished instead.`)) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (response.ok) router.push("/ultimate/admin/courses");
      else setMessage({ tone: "error", text: result?.detail ?? "The course could not be deleted." });
    } catch {
      setMessage({ tone: "error", text: "The course could not be deleted because the server could not be reached." });
    }
  }

  function focusIssue(issue: CourseAuditIssue) {
    setSelectedLessonId(issue.lessonId);
    window.setTimeout(() => {
      const target = document.getElementById(issue.blockId ? `course-block-${issue.blockId}` : "lesson-settings");
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  return (
    <div className="min-w-0">
      <header className="sticky top-3 z-20 mb-5 rounded-2xl border border-navy/10 bg-white/95 p-3 shadow-pop backdrop-blur-md sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 flex-none rounded-full ${dirty ? "bg-gold" : "bg-success"}`} /><p className="whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[0.12em] text-navy/40 sm:text-[10px] sm:tracking-[0.14em]">{dirty ? "Unsaved changes" : "All changes saved"}</p></div><h2 className="mt-1 truncate font-display text-xl font-extrabold text-navy sm:text-2xl">{course.title}</h2></div><div className="grid grid-cols-2 gap-2 sm:flex"><Link href={`/ultimate/courses/${course.slug}`} target="_blank" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy transition-colors hover:bg-haze focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Preview ↗</Link><button type="button" onClick={() => void save()} disabled={saving || !dirty} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : "Save course"}</button></div></div>
        {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${message.tone === "success" ? "bg-success-bg text-success-600" : "bg-danger-bg text-danger-600"}`}>{message.text}</p> : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Course readiness" value={`${audit.readiness}%`} detail={audit.missingAssets === 0 ? "No blocking issues" : `${audit.missingAssets} blocking issue${audit.missingAssets === 1 ? "" : "s"}`} tone={audit.missingAssets === 0 ? "success" : "warning"} />
        <MetricCard label="Published lessons" value={`${audit.publishedLessons}/${course.totalLessons}`} detail={`${course.modules.length} modules`} />
        <MetricCard label="Native practices" value={String(audit.practiceCount)} detail={`${audit.questionCount} authored questions`} />
        <MetricCard label="Missing assets" value={String(audit.missingAssets)} detail="Videos, files, or question sets" tone={audit.missingAssets === 0 ? "success" : "danger"} />
      </div>

      <AssetInbox issues={audit.issues} onFocus={focusIssue} />

      <details className="mt-5 overflow-hidden rounded-2xl border border-navy/10 bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3"><SettingsIcon /><strong className="flex-1 text-sm text-navy">Course settings</strong><span className="text-xs font-semibold text-navy/35">Title, publishing, cover, and description</span></summary>
        <div className="grid gap-4 border-t border-navy/10 bg-haze/40 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Course title"><input value={course.title} onChange={(event) => setCourse({ ...course, title: event.target.value })} className={inputClass} /></Field>
          <Field label="URL slug"><input value={course.slug} onChange={(event) => setCourse({ ...course, slug: cleanSlug(event.target.value) })} className={inputClass} /></Field>
          <Field label="Eyebrow"><input value={course.eyebrow ?? ""} onChange={(event) => setCourse({ ...course, eyebrow: event.target.value })} placeholder="e.g. Start Here" className={inputClass} /></Field>
          <Field label="Publish status"><select value={course.status} onChange={(event) => setCourse({ ...course, status: event.target.value === "published" ? "published" : "draft" })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
          <Field label="Estimated minutes"><input type="number" min="0" value={course.estimatedMinutes} onChange={(event) => setCourse({ ...course, estimatedMinutes: Number(event.target.value) || 0 })} className={inputClass} /></Field>
          <div className="sm:col-span-2">
            <CourseCoverEditor course={course} onChange={setCourse} />
          </div>
          <div className="sm:col-span-2"><Field label="Description"><textarea rows={3} value={course.description ?? ""} onChange={(event) => setCourse({ ...course, description: event.target.value })} className={inputClass} /></Field></div>
          <div className="sm:col-span-2 flex justify-end border-t border-navy/10 pt-4"><button type="button" onClick={() => void removeCourse()} className="min-h-11 cursor-pointer rounded-xl border border-danger/20 px-4 text-sm font-bold text-danger-600 transition-colors hover:bg-danger-bg">Delete course</button></div>
        </div>
      </details>

      <section className="mt-6 overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-pop">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/10 bg-haze/50 px-4 py-4 sm:px-5"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Curriculum builder</p><h3 className="mt-1 font-display text-xl font-extrabold text-navy">Modules, lessons, and content</h3></div><button type="button" onClick={addModule} className="min-h-11 cursor-pointer rounded-xl bg-navy px-4 text-sm font-extrabold text-white transition-colors hover:bg-navy/90">+ Add module</button></header>
        <div className="grid min-h-[640px] lg:grid-cols-[310px_minmax(0,1fr)]">
          <CurriculumNavigator course={course} selectedLessonId={selectedLessonId} onSelect={setSelectedLessonId} onChange={setCourse} onAddLesson={addLesson} onRemoveModule={removeModule} />
          <main className="min-w-0 p-4 sm:p-6">
            {selectedLocation ? <LessonWorkspace course={course} module={selectedLocation.module} moduleIndex={selectedLocation.moduleIndex} lesson={selectedLocation.lesson} lessonIndex={selectedLocation.lessonIndex} updateModule={updateModule} updateLesson={updateLesson} updateBlock={updateBlock} addBlock={addBlock} /> : <EmptyLesson onAdd={() => course.modules[0] ? addLesson(0) : addModule()} hasModule={course.modules.length > 0} />}
          </main>
        </div>
      </section>
    </div>
  );
}

function CourseCoverEditor({ course, onChange }: { course: Course; onChange: React.Dispatch<React.SetStateAction<Course>> }) {
  const hasCover = Boolean(course.coverUrl?.trim());
  const coverHelpId = `course-cover-help-${course.id}`;

  return (
    <section aria-labelledby={`course-cover-label-${course.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p id={`course-cover-label-${course.id}`} className={labelClass}>Course cover</p>
          <p id={coverHelpId} className="mt-1 text-xs leading-5 text-navy/45">Shown in the course library and at the top of the course page.</p>
        </div>
        {hasCover ? <span className="rounded-full bg-success-bg px-2.5 py-1 text-[10px] font-bold text-success-600">Cover added</span> : null}
      </div>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-navy/12 bg-white lg:grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <CourseCover src={course.coverUrl} title={course.title} eyebrow={course.eyebrow} className="border-b border-navy/10 lg:border-b-0 lg:border-r" />
        <div className="p-4 sm:p-5">
          <p className="text-sm font-semibold text-navy">{hasCover ? "Replace this cover" : "Add a course cover"}</p>
          <p className="mt-1 text-xs leading-5 text-navy/48">Use a 1600 × 700 image so the subject stays clear on desktop and mobile.</p>
          <CourseAssetUpload
            kind="image"
            purpose="cover"
            compact
            label={hasCover ? "Upload replacement" : "Upload cover"}
            onUploaded={(url) => onChange((current) => ({ ...current, coverUrl: url }))}
          />
          <div className="my-4 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-navy/10" /><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy/30">or paste a URL</span><span className="h-px flex-1 bg-navy/10" /></div>
          <label className="block" htmlFor={`course-cover-url-${course.id}`}>
            <span className="sr-only">Cover image URL</span>
            <input
              id={`course-cover-url-${course.id}`}
              type="url"
              inputMode="url"
              aria-describedby={coverHelpId}
              value={course.coverUrl ?? ""}
              onChange={(event) => onChange((current) => ({ ...current, coverUrl: event.target.value }))}
              placeholder="https://example.com/course-cover.webp"
              className={`${inputClass} mt-0`}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] leading-4 text-navy/38">Save the course to publish the new cover.</p>
            {hasCover ? <button type="button" onClick={() => onChange((current) => ({ ...current, coverUrl: null }))} className="min-h-10 cursor-pointer rounded-lg px-3 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-bg">Remove cover</button> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CurriculumNavigator({ course, selectedLessonId, onSelect, onChange, onAddLesson, onRemoveModule }: { course: Course; selectedLessonId: string | null; onSelect: (id: string) => void; onChange: (course: Course) => void; onAddLesson: (moduleIndex: number) => void; onRemoveModule: (moduleIndex: number) => void }) {
  return <aside className="border-b border-navy/10 bg-haze/35 p-3 lg:border-b-0 lg:border-r"><p className="px-2 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy/35">Course outline</p><div className="space-y-3">{course.modules.map((module, moduleIndex) => <details key={module.id} open className="overflow-hidden rounded-2xl border border-navy/10 bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 bg-navy px-3 py-2 text-white"><span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-white/10 text-[10px] font-extrabold">{moduleIndex + 1}</span><strong className="min-w-0 flex-1 truncate text-xs">{module.title}</strong><OrderButtons inverse onUp={(event) => { event.preventDefault(); onChange({ ...course, modules: move(course.modules, moduleIndex, -1) }); }} onDown={(event) => { event.preventDefault(); onChange({ ...course, modules: move(course.modules, moduleIndex, 1) }); }} /></summary><div className="space-y-1 p-2">{module.lessons.map((lesson, lessonIndex) => <button key={lesson.id} type="button" onClick={() => onSelect(lesson.id)} className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${lesson.id === selectedLessonId ? "bg-ice text-brand-700" : "text-navy/60 hover:bg-haze hover:text-navy"}`}><span className={`grid h-6 w-6 flex-none place-items-center rounded-lg text-[9px] font-extrabold ${lesson.status === "published" ? "bg-success-bg text-success-600" : "bg-[#fff4d5] text-[#8a6500]"}`}>{lessonIndex + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{lesson.title}</span><span className="text-[9px] font-bold text-navy/30">{lesson.blocks.length}</span></button>)}<div className="grid grid-cols-[1fr_auto] gap-1"><button type="button" onClick={() => onAddLesson(moduleIndex)} className="min-h-10 cursor-pointer rounded-xl border border-dashed border-brand/25 text-xs font-extrabold text-brand-700 transition-colors hover:bg-ice">+ Add lesson</button><button type="button" aria-label={`Delete module ${module.title}`} onClick={() => onRemoveModule(moduleIndex)} className="min-h-10 cursor-pointer rounded-xl px-3 text-xs font-extrabold text-danger-600 transition-colors hover:bg-danger-bg">Delete</button></div></div></details>)}</div></aside>;
}

function LessonWorkspace({ course, module, moduleIndex, lesson, lessonIndex, updateModule, updateLesson, updateBlock, addBlock }: { course: Course; module: CourseModule; moduleIndex: number; lesson: CourseLesson; lessonIndex: number; updateModule: (moduleIndex: number, update: Partial<CourseModule>) => void; updateLesson: (moduleIndex: number, lessonIndex: number, update: Partial<CourseLesson>) => void; updateBlock: (moduleIndex: number, lessonIndex: number, blockIndex: number, update: Partial<LessonBlock>) => void; addBlock: (moduleIndex: number, lessonIndex: number, kind: LessonBlockKind) => void }) {
  return <div><section className="rounded-2xl border border-navy/10 bg-haze/35 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-600">Module settings</p><h4 className="mt-1 font-display text-lg font-extrabold text-navy">{module.title}</h4></div><select aria-label="Module publishing status" value={module.status} onChange={(event) => updateModule(moduleIndex, { status: event.target.value === "published" ? "published" : "draft" })} className="min-h-10 rounded-xl border border-navy/15 bg-white px-3 text-xs font-bold text-navy outline-none focus:border-brand"><option value="draft">Draft module</option><option value="published">Published module</option></select></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Module title"><input value={module.title} onChange={(event) => updateModule(moduleIndex, { title: event.target.value })} className={inputClass} /></Field><Field label="Module slug"><input value={module.slug} onChange={(event) => updateModule(moduleIndex, { slug: cleanSlug(event.target.value) })} className={inputClass} /></Field><div className="sm:col-span-2"><Field label="Module description"><input value={module.description ?? ""} onChange={(event) => updateModule(moduleIndex, { description: event.target.value })} className={inputClass} /></Field></div></div></section>
    <section id="lesson-settings" className="mt-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Lesson {lessonIndex + 1}</p><h3 className="mt-1 font-display text-2xl font-extrabold text-navy">{lesson.title}</h3></div><Link href={`/ultimate/courses/${course.slug}/${lesson.slug}`} target="_blank" className="inline-flex min-h-10 items-center rounded-xl border border-navy/10 px-3 text-xs font-bold text-navy/55 transition-colors hover:bg-haze hover:text-navy">Preview lesson ↗</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Lesson title"><input value={lesson.title} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { title: event.target.value })} className={inputClass} /></Field><Field label="Lesson slug"><input value={lesson.slug} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { slug: cleanSlug(event.target.value) })} className={inputClass} /></Field><Field label="Estimated minutes"><input type="number" min="0" value={lesson.estimatedMinutes} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { estimatedMinutes: Number(event.target.value) || 0 })} className={inputClass} /></Field><Field label="Publish status"><select value={lesson.status} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { status: event.target.value === "published" ? "published" : "draft" })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="sm:col-span-2"><Field label="Lesson summary"><textarea rows={2} value={lesson.summary ?? ""} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { summary: event.target.value })} className={inputClass} /></Field></div></div></section>
    <div className="mb-3 mt-7 flex items-center justify-between"><div><h4 className="font-display text-lg font-extrabold text-navy">Lesson content</h4><p className="mt-1 text-xs text-navy/45">Students see these blocks in this exact order.</p></div><span className="rounded-full bg-haze px-3 py-1.5 text-xs font-bold text-navy/45">{lesson.blocks.length} blocks</span></div>
    <div className="space-y-4">{lesson.blocks.map((block, blockIndex) => <BlockEditor key={block.id} block={block} defaultOpen={blockIndex === 0} onChange={(update) => updateBlock(moduleIndex, lessonIndex, blockIndex, update)} onMove={(direction) => updateLesson(moduleIndex, lessonIndex, { blocks: move(lesson.blocks, blockIndex, direction) })} onRemove={() => { if (window.confirm("Delete this content block?")) updateLesson(moduleIndex, lessonIndex, { blocks: lesson.blocks.filter((_, index) => index !== blockIndex) }); }} />)}</div>
    <div className="mt-5 rounded-2xl border border-dashed border-brand/30 bg-ice/35 p-3"><p className="mb-3 px-1 text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand-700">Add content</p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{blockKinds.map(({ kind, label, description }) => <button key={kind} type="button" onClick={() => addBlock(moduleIndex, lessonIndex, kind)} className="min-h-20 cursor-pointer rounded-xl border border-navy/10 bg-white px-3 py-3 text-left transition-colors hover:border-brand/35 hover:bg-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><strong className="block text-xs text-navy">+ {label}</strong><span className="mt-1 block text-[10px] leading-4 text-navy/40">{description}</span></button>)}</div></div>
    <div className="mt-5 flex justify-end border-t border-navy/10 pt-4"><button type="button" onClick={() => { if (window.confirm(`Delete “${lesson.title}”?`)) updateModule(moduleIndex, { lessons: module.lessons.filter((_, index) => index !== lessonIndex) }); }} className="min-h-10 cursor-pointer rounded-xl px-3 text-xs font-extrabold text-danger-600 transition-colors hover:bg-danger-bg">Delete lesson</button></div>
  </div>;
}

function BlockEditor({ block, defaultOpen, onChange, onMove, onRemove }: { block: LessonBlock; defaultOpen: boolean; onChange: (update: Partial<LessonBlock>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const content = block.content;
  const setContent = (update: Partial<LessonBlock["content"]>) => onChange({ content: { ...content, ...update } });
  function convert(kind: LessonBlockKind) {
    const shared = { title: content.title ?? "", description: content.description ?? content.body ?? "", eyebrow: content.eyebrow, step: content.step };
    const next: LessonBlock["content"] = kind === "text" ? { ...shared, body: content.body ?? content.description ?? "", status: "instruction" } : kind === "practice" ? { ...shared, practice: content.practice ?? emptyCoursePractice(content.title || "New practice") } : { ...shared, url: content.url ?? "" };
    onChange({ kind, content: next });
  }
  return (
    <details id={`course-block-${block.id}`} open={defaultOpen || content.status === "unavailable"} className={`group scroll-mt-28 overflow-hidden rounded-2xl border bg-white ${content.status === "unavailable" ? "border-gold/45" : "border-navy/10"}`}>
      <summary className={`flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4 ${content.status === "unavailable" ? "border-gold/25 bg-[#fff9e9]" : "border-navy/10 bg-haze/45"}`}>
        <ChevronDownIcon className="h-4 w-4 flex-none text-navy/35 transition-transform group-open:rotate-180" />
        <select aria-label="Content block type" value={block.kind} onClick={(event) => event.stopPropagation()} onChange={(event) => convert(event.target.value as LessonBlockKind)} className="min-h-9 cursor-pointer rounded-lg border border-navy/15 bg-white px-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-navy outline-none focus:border-brand">{blockKinds.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select>
        {content.status === "unavailable" ? <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#7b5b00]">Missing asset</span> : null}
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-navy/45">{content.title || content.practice?.title || blockKinds.find((item) => item.kind === block.kind)?.description}</span>
        <OrderButtons onUp={(event) => { event.preventDefault(); onMove(-1); }} onDown={(event) => { event.preventDefault(); onMove(1); }} />
        <button type="button" onClick={(event) => { event.preventDefault(); onRemove(); }} className="min-h-9 cursor-pointer rounded-lg px-2 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-bg">Remove</button>
      </summary>
      <div className="p-4 sm:p-5">
        {content.status === "unavailable" ? <MissingAssetResolver title={content.title} onConvert={convert} /> : null}
        <BlockFields block={block} setContent={setContent} />
      </div>
    </details>
  );
}

function BlockFields({ block, setContent }: { block: LessonBlock; setContent: (update: Partial<LessonBlock["content"]>) => void }) {
  const content = block.content;
  if (block.kind === "practice") return <PracticeBuilder value={content.practice ?? emptyCoursePractice(content.title)} onChange={(practice) => setContent({ practice, title: practice.title, status: undefined })} />;
  if (block.kind === "text") return <div className="grid gap-3 sm:grid-cols-2">{content.title || content.status ? <><Field label="Step title"><input value={content.title ?? ""} onChange={(event) => setContent({ title: event.target.value })} className={inputClass} /></Field><Field label="Label"><input value={content.eyebrow ?? ""} onChange={(event) => setContent({ eyebrow: event.target.value })} placeholder="Watch, Practice, Assignment…" className={inputClass} /></Field></> : null}<div className="sm:col-span-2"><Field label={content.title ? "Instructions" : "Lesson text"}><textarea rows={6} value={content.body ?? ""} onChange={(event) => setContent({ body: event.target.value })} className={inputClass} /></Field></div></div>;
  if (block.kind === "video") return <div className="grid gap-3 sm:grid-cols-2"><Field label="Video title"><input value={content.title ?? ""} onChange={(event) => setContent({ title: event.target.value })} className={inputClass} /></Field><Field label="Label"><input value={content.eyebrow ?? ""} onChange={(event) => setContent({ eyebrow: event.target.value })} placeholder="Watch" className={inputClass} /></Field><div className="sm:col-span-2"><Field label="Video URL"><input type="url" value={content.url ?? ""} onChange={(event) => setContent({ url: event.target.value, status: undefined })} placeholder="Google Drive, YouTube, Vimeo, or uploaded video URL" className={inputClass} /><CourseAssetUpload kind="video" onUploaded={(url, name) => setContent({ url, title: content.title || name, status: undefined })} /></Field></div><div className="sm:col-span-2"><Field label="Student directions"><textarea rows={2} value={content.description ?? ""} onChange={(event) => setContent({ description: event.target.value })} className={inputClass} /></Field></div></div>;
  if (block.kind === "image") return <div className="grid gap-3 sm:grid-cols-2"><Field label="Image URL"><input type="url" value={content.url ?? ""} onChange={(event) => setContent({ url: event.target.value, status: undefined })} className={inputClass} /><CourseAssetUpload kind="image" onUploaded={(url, name) => setContent({ url, title: content.title || name, status: undefined })} /></Field><Field label="Alt text"><input value={content.alt ?? ""} onChange={(event) => setContent({ alt: event.target.value })} placeholder="Describe the image for accessibility" className={inputClass} /></Field><Field label="Caption"><input value={content.caption ?? ""} onChange={(event) => setContent({ caption: event.target.value })} className={inputClass} /></Field><Field label="Internal title"><input value={content.title ?? ""} onChange={(event) => setContent({ title: event.target.value })} className={inputClass} /></Field></div>;
  return <div className="grid gap-3 sm:grid-cols-2"><Field label="Resource title"><input value={content.title ?? ""} onChange={(event) => setContent({ title: event.target.value })} className={inputClass} /></Field><Field label="Button label"><input value={content.actionLabel ?? ""} onChange={(event) => setContent({ actionLabel: event.target.value })} placeholder="Open resource" className={inputClass} /></Field><div className="sm:col-span-2"><Field label="File or destination URL"><input type="url" value={content.url ?? ""} onChange={(event) => setContent({ url: event.target.value, status: undefined })} placeholder="Upload a file or paste an internal/external URL" className={inputClass} /><CourseAssetUpload kind="file" onUploaded={(url, name) => setContent({ url, title: content.title || name, status: undefined })} /></Field></div><div className="sm:col-span-2"><Field label="Description"><textarea rows={2} value={content.description ?? ""} onChange={(event) => setContent({ description: event.target.value })} className={inputClass} /></Field></div><Field label="Display"><select value={content.display ?? "card"} onChange={(event) => setContent({ display: event.target.value === "embed" ? "embed" : "card" })} className={inputClass}><option value="card">Resource card</option><option value="embed">Embed document</option></select></Field></div>;
}

function MissingAssetResolver({ title, onConvert }: { title?: string; onConvert: (kind: LessonBlockKind) => void }) { return <div className="mb-4 rounded-2xl border border-gold/30 bg-[#fff9e9] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#866300]">Source needed</p><strong className="mt-1 block text-sm text-navy">{title || "This lesson step is missing its original asset."}</strong><p className="mt-1 text-xs leading-5 text-navy/50">Resolve it now by choosing what Scott should add. The missing flag disappears after content is created.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onConvert("video")} className="min-h-10 cursor-pointer rounded-xl border border-gold/30 bg-white px-3 text-xs font-extrabold text-navy hover:border-brand/35">Add video</button><button type="button" onClick={() => onConvert("file")} className="min-h-10 cursor-pointer rounded-xl border border-gold/30 bg-white px-3 text-xs font-extrabold text-navy hover:border-brand/35">Upload resource</button><button type="button" onClick={() => onConvert("practice")} className="min-h-10 cursor-pointer rounded-xl bg-navy px-3 text-xs font-extrabold text-white">Build practice</button></div></div>; }

function AssetInbox({ issues, onFocus }: { issues: CourseAuditIssue[]; onFocus: (issue: CourseAuditIssue) => void }) {
  const blocking = issues.filter((issue) => issue.severity === "missing");
  return <details open={blocking.length > 0} className={`mt-5 overflow-hidden rounded-2xl border ${blocking.length > 0 ? "border-gold/35 bg-[#fffdf5]" : "border-success/20 bg-success-bg"}`}><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5"><AuditIcon /><span className="min-w-0 flex-1"><strong className="block text-sm text-navy">Content health inbox</strong><span className="mt-0.5 block text-xs text-navy/45">{blocking.length > 0 ? `${blocking.length} missing asset${blocking.length === 1 ? "" : "s"} need Scott's attention` : "Everything required is connected"}</span></span><span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${blocking.length > 0 ? "bg-gold/15 text-[#7b5b00]" : "bg-white text-success-600"}`}>{issues.length}</span></summary>{issues.length > 0 ? <div className="max-h-[360px] overflow-y-auto border-t border-current/10 p-2 sm:p-3"><div className="space-y-2">{issues.map((issue) => <button key={issue.id} type="button" onClick={() => onFocus(issue)} className="flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-xl border border-navy/10 bg-white px-3 py-3 text-left transition-colors hover:border-brand/30 hover:bg-ice/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${issue.severity === "missing" ? "bg-gold" : "bg-brand"}`} /><span className="min-w-0 flex-1"><strong className="block text-xs text-navy">{issue.title}</strong><span className="mt-1 block text-[11px] leading-4 text-navy/45">{issue.detail}</span></span><span className="text-xs font-extrabold text-brand-700">Fix →</span></button>)}</div></div> : null}</details>;
}

function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "success" | "warning" | "danger" }) { const colors = tone === "success" ? "bg-success-bg text-success-600" : tone === "warning" ? "bg-[#fff8e4] text-[#866300]" : tone === "danger" ? "bg-danger-bg text-danger-600" : "bg-ice text-brand-700"; return <div className="rounded-2xl border border-navy/10 bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-navy/40">{label}</p><div className="mt-2 flex items-end justify-between gap-2"><strong className="font-display text-2xl font-extrabold text-navy">{value}</strong><span className={`h-2.5 w-2.5 rounded-full ${colors}`} /></div><p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${colors}`}>{detail}</p></div>; }
function EmptyLesson({ onAdd, hasModule }: { onAdd: () => void; hasModule: boolean }) { return <div className="grid min-h-[520px] place-items-center text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ice text-brand-700"><BookIcon /></span><h3 className="mt-4 font-display text-xl font-extrabold text-navy">{hasModule ? "Add the first lesson" : "Create your first module"}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-navy/45">Build a structured student path with videos, notes, uploads, and native practices.</p><button type="button" onClick={onAdd} className="mt-4 min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white">{hasModule ? "+ Add lesson" : "+ Add module"}</button></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }
function OrderButtons({ onUp, onDown, inverse = false }: { onUp: (event: React.MouseEvent<HTMLButtonElement>) => void; onDown: (event: React.MouseEvent<HTMLButtonElement>) => void; inverse?: boolean }) { return <span className={`inline-flex overflow-hidden rounded-lg border ${inverse ? "border-white/15" : "border-navy/10 bg-white"}`}><button type="button" aria-label="Move up" onClick={onUp} className={`grid h-8 w-8 cursor-pointer place-items-center text-xs transition-colors ${inverse ? "hover:bg-white/10" : "text-navy/45 hover:bg-ice hover:text-brand-700"}`}>↑</button><button type="button" aria-label="Move down" onClick={onDown} className={`grid h-8 w-8 cursor-pointer place-items-center border-l text-xs transition-colors ${inverse ? "border-white/15 hover:bg-white/10" : "border-navy/10 text-navy/45 hover:bg-ice hover:text-brand-700"}`}>↓</button></span>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" strokeLinecap="round" /><circle cx="12" cy="12" r="3" /></svg>; }
function ChevronDownIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function AuditIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none text-[#9a7200]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 4h6m-7 3h8a2 2 0 0 1 2 2v10H6V9a2 2 0 0 1 2-2Z" strokeLinecap="round" /><path d="m9 13 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function BookIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" strokeLinejoin="round" /><path d="M8 20a3 3 0 0 1 0-6h11" strokeLinecap="round" /></svg>; }
