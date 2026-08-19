"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import type { Course, CourseInput, CourseLesson, CourseModule, LessonBlock, LessonBlockKind } from "@/lib/courses/types";

const inputClass = "mt-1.5 w-full rounded-xl border border-navy/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.11em] text-navy/45";

function cleanSlug(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function move<T>(items: T[], index: number, direction: -1 | 1): T[] { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; }

export function CourseEditor({ initial }: { initial: Course }) {
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateModule(moduleIndex: number, update: Partial<CourseModule>) { setCourse((current) => ({ ...current, modules: current.modules.map((courseModule, index) => index === moduleIndex ? { ...courseModule, ...update } : courseModule) })); }
  function updateLesson(moduleIndex: number, lessonIndex: number, update: Partial<CourseLesson>) { const courseModule = course.modules[moduleIndex]; updateModule(moduleIndex, { lessons: courseModule.lessons.map((lesson, index) => index === lessonIndex ? { ...lesson, ...update } : lesson) }); }
  function updateBlock(moduleIndex: number, lessonIndex: number, blockIndex: number, update: Partial<LessonBlock>) { const lesson = course.modules[moduleIndex].lessons[lessonIndex]; updateLesson(moduleIndex, lessonIndex, { blocks: lesson.blocks.map((block, index) => index === blockIndex ? { ...block, ...update } : block) }); }

  function addModule() { const id = crypto.randomUUID(); setCourse((current) => ({ ...current, modules: [...current.modules, { id, slug: `module-${current.modules.length + 1}`, title: "New module", description: null, position: current.modules.length + 1, status: "draft", lessons: [] }] })); }
  function addLesson(moduleIndex: number) { const courseModule = course.modules[moduleIndex]; const id = crypto.randomUUID(); updateModule(moduleIndex, { lessons: [...courseModule.lessons, { id, slug: `lesson-${courseModule.lessons.length + 1}`, title: "New lesson", summary: null, position: courseModule.lessons.length + 1, estimatedMinutes: 5, status: "draft", completed: false, blocks: [] }] }); }
  function addBlock(moduleIndex: number, lessonIndex: number, kind: LessonBlockKind) { const lesson = course.modules[moduleIndex].lessons[lessonIndex]; updateLesson(moduleIndex, lessonIndex, { blocks: [...lesson.blocks, { id: crypto.randomUUID(), position: lesson.blocks.length + 1, kind, content: kind === "text" ? { body: "" } : { url: "" } }] }); }

  async function save() {
    setSaving(true); setMessage(null);
    const input: CourseInput = { id: course.id, slug: cleanSlug(course.slug), title: course.title, description: course.description, eyebrow: course.eyebrow, coverUrl: course.coverUrl, position: course.position, estimatedMinutes: course.estimatedMinutes, status: course.status, modules: course.modules };
    const response = await fetch(`/api/admin/courses/${course.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    setSaving(false);
    if (response.ok) { setMessage("Course saved."); router.refresh(); } else setMessage("The course could not be saved. Check for duplicate slugs and try again.");
  }

  async function removeCourse() { if (!window.confirm("Delete this course and all of its lessons?")) return; const response = await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" }); if (response.ok) router.push("/ultimate/admin/courses"); }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-600">Course editor</p><h2 className="mt-1 font-display text-2xl font-extrabold text-navy">{course.title}</h2><p className="mt-1 text-sm text-navy/45">Changes stay private until the course, module, and lesson are published.</p></div><div className="flex gap-2"><button type="button" onClick={removeCourse} className="min-h-11 cursor-pointer rounded-xl border border-danger/20 bg-white px-4 text-sm font-bold text-danger-600 hover:bg-danger-bg">Delete</button><button type="button" onClick={save} disabled={saving} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : "Save course"}</button></div></div>
      {message ? <p role="status" className={`mb-5 rounded-xl px-4 py-3 text-sm font-semibold ${message === "Course saved." ? "bg-success-bg text-success-600" : "bg-danger-bg text-danger-600"}`}>{message}</p> : null}

      <section className="grid gap-4 rounded-2xl border border-navy/10 bg-haze/45 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Course title"><input value={course.title} onChange={(event) => setCourse({ ...course, title: event.target.value })} className={inputClass} /></Field>
        <Field label="URL slug"><input value={course.slug} onChange={(event) => setCourse({ ...course, slug: cleanSlug(event.target.value) })} className={inputClass} /></Field>
        <Field label="Eyebrow"><input value={course.eyebrow ?? ""} onChange={(event) => setCourse({ ...course, eyebrow: event.target.value })} placeholder="e.g. Start Here" className={inputClass} /></Field>
        <Field label="Publish status"><select value={course.status} onChange={(event) => setCourse({ ...course, status: event.target.value === "published" ? "published" : "draft" })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
        <Field label="Estimated minutes"><input type="number" min="0" value={course.estimatedMinutes} onChange={(event) => setCourse({ ...course, estimatedMinutes: Number(event.target.value) || 0 })} className={inputClass} /></Field>
        <Field label="Cover image URL"><input type="url" value={course.coverUrl ?? ""} onChange={(event) => setCourse({ ...course, coverUrl: event.target.value })} className={inputClass} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><textarea rows={3} value={course.description ?? ""} onChange={(event) => setCourse({ ...course, description: event.target.value })} className={inputClass} /></Field></div>
      </section>

      <div className="mb-4 mt-8 flex items-center justify-between gap-3"><div><h3 className="font-display text-xl font-extrabold text-navy">Curriculum</h3><p className="mt-1 text-sm text-navy/45">Use the arrows to control the exact student order.</p></div><button type="button" onClick={addModule} className="min-h-11 cursor-pointer rounded-xl border border-brand/25 bg-ice px-4 text-sm font-extrabold text-brand-600 hover:border-brand/45">+ Add module</button></div>

      <div className="space-y-5">
        {course.modules.map((module, moduleIndex) => (
          <section key={module.id} className="overflow-hidden rounded-2xl border border-navy/10">
            <div className="flex flex-wrap items-center gap-3 border-b border-navy/10 bg-navy px-4 py-3 text-white"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-xs font-extrabold">{moduleIndex + 1}</span><strong className="min-w-0 flex-1 truncate text-sm">{module.title}</strong><OrderButtons onUp={() => setCourse({ ...course, modules: move(course.modules, moduleIndex, -1) })} onDown={() => setCourse({ ...course, modules: move(course.modules, moduleIndex, 1) })} /><button type="button" onClick={() => setCourse({ ...course, modules: course.modules.filter((_, index) => index !== moduleIndex) })} className="min-h-9 cursor-pointer rounded-lg px-3 text-xs font-bold text-white/55 hover:bg-white/10 hover:text-white">Remove</button></div>
            <div className="grid gap-3 bg-haze/45 p-4 sm:grid-cols-3"><Field label="Module title"><input value={module.title} onChange={(event) => updateModule(moduleIndex, { title: event.target.value })} className={inputClass} /></Field><Field label="Slug"><input value={module.slug} onChange={(event) => updateModule(moduleIndex, { slug: cleanSlug(event.target.value) })} className={inputClass} /></Field><Field label="Status"><select value={module.status} onChange={(event) => updateModule(moduleIndex, { status: event.target.value === "published" ? "published" : "draft" })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="sm:col-span-3"><Field label="Description"><input value={module.description ?? ""} onChange={(event) => updateModule(moduleIndex, { description: event.target.value })} className={inputClass} /></Field></div></div>
            <div className="space-y-3 p-4">
              {module.lessons.map((lesson, lessonIndex) => (
                <details key={lesson.id} className="group rounded-xl border border-navy/10 bg-white" open={lessonIndex === 0}>
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2"><span className={`h-2.5 w-2.5 rounded-full ${lesson.status === "published" ? "bg-success" : "bg-gold"}`} /><strong className="min-w-0 flex-1 truncate text-sm text-navy">{lessonIndex + 1}. {lesson.title}</strong><span className="text-xs text-navy/35">{lesson.blocks.length} blocks</span><OrderButtons onUp={(event) => { event.preventDefault(); updateModule(moduleIndex, { lessons: move(module.lessons, lessonIndex, -1) }); }} onDown={(event) => { event.preventDefault(); updateModule(moduleIndex, { lessons: move(module.lessons, lessonIndex, 1) }); }} /></summary>
                  <div className="border-t border-navy/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-2"><Field label="Lesson title"><input value={lesson.title} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { title: event.target.value })} className={inputClass} /></Field><Field label="Slug"><input value={lesson.slug} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { slug: cleanSlug(event.target.value) })} className={inputClass} /></Field><Field label="Estimated minutes"><input type="number" min="0" value={lesson.estimatedMinutes} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { estimatedMinutes: Number(event.target.value) || 0 })} className={inputClass} /></Field><Field label="Status"><select value={lesson.status} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { status: event.target.value === "published" ? "published" : "draft" })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="sm:col-span-2"><Field label="Summary"><input value={lesson.summary ?? ""} onChange={(event) => updateLesson(moduleIndex, lessonIndex, { summary: event.target.value })} className={inputClass} /></Field></div></div>
                    <div className="mt-5 space-y-3">{lesson.blocks.map((block, blockIndex) => <BlockEditor key={block.id} block={block} onChange={(update) => updateBlock(moduleIndex, lessonIndex, blockIndex, update)} onMove={(direction) => updateLesson(moduleIndex, lessonIndex, { blocks: move(lesson.blocks, blockIndex, direction) })} onRemove={() => updateLesson(moduleIndex, lessonIndex, { blocks: lesson.blocks.filter((_, index) => index !== blockIndex) })} />)}</div>
                    <div className="mt-4 flex flex-wrap gap-2">{(["text", "video", "image", "file"] as LessonBlockKind[]).map((kind) => <button key={kind} type="button" onClick={() => addBlock(moduleIndex, lessonIndex, kind)} className="min-h-10 cursor-pointer rounded-xl border border-navy/10 bg-haze px-3 text-xs font-bold capitalize text-navy/60 hover:border-brand/30 hover:text-brand-600">+ {kind}</button>)}<button type="button" onClick={() => updateModule(moduleIndex, { lessons: module.lessons.filter((_, index) => index !== lessonIndex) })} className="ml-auto min-h-10 cursor-pointer rounded-xl px-3 text-xs font-bold text-danger-600 hover:bg-danger-bg">Remove lesson</button></div>
                  </div>
                </details>
              ))}
              <button type="button" onClick={() => addLesson(moduleIndex)} className="min-h-11 w-full cursor-pointer rounded-xl border border-dashed border-brand/30 text-sm font-extrabold text-brand-600 hover:bg-ice">+ Add lesson</button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BlockEditor({ block, onChange, onMove, onRemove }: { block: LessonBlock; onChange: (update: Partial<LessonBlock>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const content = block.content;
  const setContent = (update: Partial<LessonBlock["content"]>) => onChange({ content: { ...content, ...update } });
  return <div className="rounded-xl border border-navy/10 bg-haze/45 p-3"><div className="mb-3 flex items-center gap-2"><span className="rounded-lg bg-navy px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{block.kind}</span><OrderButtons onUp={() => onMove(-1)} onDown={() => onMove(1)} /><button type="button" onClick={onRemove} className="ml-auto min-h-9 cursor-pointer rounded-lg px-2 text-xs font-bold text-danger-600 hover:bg-danger-bg">Remove</button></div>{block.kind === "text" ? <Field label="Lesson text"><textarea rows={7} value={content.body ?? ""} onChange={(event) => setContent({ body: event.target.value })} className={inputClass} /></Field> : <div className="grid gap-3 sm:grid-cols-2"><Field label={`${block.kind} URL`}><input type="url" value={content.url ?? ""} onChange={(event) => setContent({ url: event.target.value })} className={inputClass} />{block.kind === "image" || block.kind === "file" ? <CourseAssetUpload onUploaded={(url, name) => setContent({ url, title: content.title || name })} /> : null}</Field><Field label={block.kind === "image" ? "Alt text" : "Title"}><input value={(block.kind === "image" ? content.alt : content.title) ?? ""} onChange={(event) => block.kind === "image" ? setContent({ alt: event.target.value }) : setContent({ title: event.target.value })} className={inputClass} /></Field>{block.kind === "image" ? <Field label="Caption"><input value={content.caption ?? ""} onChange={(event) => setContent({ caption: event.target.value })} className={inputClass} /></Field> : null}{block.kind === "file" ? <Field label="Description"><input value={content.description ?? ""} onChange={(event) => setContent({ description: event.target.value })} className={inputClass} /></Field> : null}</div>}</div>;
}

function CourseAssetUpload({ onUploaded }: { onUploaded: (url: string, name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setUploading(true); const body = new FormData(); body.append("file", file);
    const response = await fetch("/api/admin/courses/upload", { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { url?: string; name?: string } | null;
    if (response.ok && data?.url) onUploaded(data.url, data.name ?? file.name);
    setUploading(false);
  }
  return <><input ref={input} type="file" onChange={upload} className="hidden" /><button type="button" onClick={() => input.current?.click()} disabled={uploading} className="mt-2 min-h-10 cursor-pointer rounded-xl border border-brand/25 bg-ice px-3 text-xs font-bold text-brand-600 disabled:cursor-wait disabled:opacity-60">{uploading ? "Uploading…" : "Upload asset"}</button><span className="ml-2 text-[10px] text-navy/35">Up to 4 MB</span></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className={labelClass}>{label}</span>{children}</label>; }
function OrderButtons({ onUp, onDown }: { onUp: (event: React.MouseEvent<HTMLButtonElement>) => void; onDown: (event: React.MouseEvent<HTMLButtonElement>) => void }) { return <span className="inline-flex overflow-hidden rounded-lg border border-current/15"><button type="button" aria-label="Move up" onClick={onUp} className="grid h-9 w-9 cursor-pointer place-items-center hover:bg-black/5">↑</button><button type="button" aria-label="Move down" onClick={onDown} className="grid h-9 w-9 cursor-pointer place-items-center border-l border-current/15 hover:bg-black/5">↓</button></span>; }
