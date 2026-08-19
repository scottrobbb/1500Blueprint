/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseProgress } from "@/components/ultimate/courses/CourseProgress";
import { getSession } from "@/lib/auth/session";
import { getCourseForStudent } from "@/lib/courses/queries";
import type { LessonBlock } from "@/lib/courses/types";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ courseSlug: string; lessonSlug: string }> };

export default async function UltimateLessonPage({ params }: Props) {
  const session = await getSession();
  if (!session) notFound();
  const { courseSlug, lessonSlug } = await params;
  const course = await getCourseForStudent(courseSlug, session.email);
  if (!course) notFound();
  const lessons = course.modules.flatMap((module) => module.lessons.map((lesson) => ({ lesson, module })));
  const currentIndex = lessons.findIndex(({ lesson }) => lesson.slug === lessonSlug);
  if (currentIndex < 0) notFound();
  const { lesson, module } = lessons[currentIndex];
  const previous = lessons[currentIndex - 1]?.lesson;
  const next = lessons[currentIndex + 1]?.lesson;

  return (
    <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 py-6 sm:px-7 lg:grid-cols-[280px_minmax(0,1fr)] lg:py-8">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <Link href={`/ultimate/courses/${course.slug}`} className="inline-flex min-h-11 items-center text-sm font-bold text-navy/50 hover:text-brand-600">← Course overview</Link>
        <div className="mt-3 overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
          <div className="border-b border-navy/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">Course outline</p><h2 className="mt-1 font-display text-base font-extrabold text-navy">{course.title}</h2><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full bg-brand" style={{ width: `${course.progress}%` }} /></div></div>
          <nav aria-label="Course lessons" className="p-2">
            {course.modules.map((courseModule) => <div key={courseModule.id} className="mb-2"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-navy/35">{courseModule.title}</p>{courseModule.lessons.map((item) => <Link key={item.id} href={`/ultimate/courses/${course.slug}/${item.slug}`} aria-current={item.id === lesson.id ? "page" : undefined} className={`flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${item.id === lesson.id ? "bg-navy text-white" : "text-navy/55 hover:bg-haze hover:text-navy"}`}><span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[9px] ${item.completed ? "bg-success text-white" : item.id === lesson.id ? "bg-white/15" : "bg-navy/[0.07]"}`}>{item.completed ? "✓" : item.position}</span><span className="line-clamp-2">{item.title}</span></Link>)}</div>)}
          </nav>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-pop">
          <header className="border-b border-navy/10 px-5 py-6 sm:px-8 sm:py-8"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">{module.title} · {lesson.estimatedMinutes || 5} min</p><h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-[-0.035em] text-ink sm:text-[38px]">{lesson.title}</h1>{lesson.summary ? <p className="mt-3 max-w-2xl text-sm leading-6 text-navy/50">{lesson.summary}</p> : null}</header>
          <article className="space-y-7 px-5 py-7 sm:px-8 sm:py-9">
            {lesson.blocks.length > 0 ? lesson.blocks.map((block) => <LessonContent key={block.id} block={block} />) : <p className="rounded-2xl bg-haze p-5 text-sm text-navy/50">Lesson content is being formatted.</p>}
          </article>
          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-navy/10 bg-haze/45 px-5 py-5 sm:px-8"><CourseProgress lessonId={lesson.id} initialCompleted={lesson.completed} /><div className="flex gap-2">{previous ? <Link href={`/ultimate/courses/${course.slug}/${previous.slug}`} className="inline-flex min-h-11 items-center rounded-xl border border-navy/15 bg-white px-4 text-sm font-bold text-navy">Previous</Link> : null}{next ? <Link href={`/ultimate/courses/${course.slug}/${next.slug}`} className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-bold text-white">Next lesson →</Link> : <Link href={`/ultimate/courses/${course.slug}`} className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-bold text-white">Finish course</Link>}</div></footer>
        </div>
      </main>
    </div>
  );
}

function LessonContent({ block }: { block: LessonBlock }) {
  if (block.kind === "text") return <div className="max-w-[74ch] whitespace-pre-wrap text-[16px] leading-8 text-ink/90">{block.content.body}</div>;
  if (block.kind === "image" && block.content.url) return <figure className="overflow-hidden rounded-2xl border border-navy/10 bg-haze p-2"><img src={block.content.url} alt={block.content.alt ?? "Lesson illustration"} className="mx-auto max-h-[620px] w-auto rounded-xl object-contain" />{block.content.caption ? <figcaption className="px-3 py-2 text-center text-xs text-navy/45">{block.content.caption}</figcaption> : null}</figure>;
  if (block.kind === "video" && block.content.url) {
    const embedUrl = videoEmbed(block.content.url);
    return <section><h2 className="mb-3 font-display text-xl font-extrabold text-navy">{block.content.title ?? "Video lesson"}</h2>{embedUrl ? <div className="aspect-video overflow-hidden rounded-2xl bg-navy"><iframe src={embedUrl} title={block.content.title ?? "Lesson video"} loading="lazy" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <video controls src={block.content.url} className="aspect-video w-full rounded-2xl bg-navy" />}</section>;
  }
  if (block.kind === "file" && block.content.url) {
    const embedUrl = driveResourceEmbed(block.content.url);
    if (embedUrl) return <section className="overflow-hidden rounded-2xl border border-navy/10 bg-white"><div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-navy/10 bg-haze/55 px-4 py-3 sm:px-5"><div><h2 className="font-display text-lg font-extrabold text-navy">{block.content.title ?? "Lesson notes"}</h2>{block.content.description ? <p className="mt-1 text-xs text-navy/45">{block.content.description}</p> : null}</div><a href={block.content.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-brand/25 bg-white px-4 text-xs font-bold text-brand-700 transition-colors hover:border-brand/45 hover:bg-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Open full size ↗</a></div><iframe src={embedUrl} title={block.content.title ?? "Lesson notes"} loading="lazy" className="h-[68vh] min-h-[520px] w-full bg-white" /></section>;
    return <a href={block.content.url} target="_blank" rel="noreferrer" className="flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border border-brand/20 bg-ice px-5 py-4 transition-colors hover:border-brand/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">↓</span><span><strong className="block text-sm text-navy">{block.content.title ?? "Download resource"}</strong>{block.content.description ? <span className="mt-1 block text-xs text-navy/45">{block.content.description}</span> : null}</span></a>;
  }
  return null;
}

function videoEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) { const id = parsed.searchParams.get("v"); return id ? `https://www.youtube.com/embed/${id}` : null; }
    if (parsed.hostname === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.hostname.includes("vimeo.com")) return `https://player.vimeo.com/video/${parsed.pathname.split("/").filter(Boolean).pop()}`;
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
      return id ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
  } catch { return null; }
  return null;
}

function driveResourceEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.match(/\/(?:document|spreadsheets|presentation)\/d\/([^/]+)/)?.[1];
    if (!id) return null;
    if (parsed.hostname === "docs.google.com" && parsed.pathname.startsWith("/document/")) return `https://docs.google.com/document/d/${id}/preview`;
    if (parsed.hostname === "docs.google.com" && parsed.pathname.startsWith("/spreadsheets/")) return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    if (parsed.hostname === "docs.google.com" && parsed.pathname.startsWith("/presentation/")) return `https://docs.google.com/presentation/d/${id}/preview`;
  } catch { return null; }
  return null;
}
