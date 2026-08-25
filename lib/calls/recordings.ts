import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { CallRecordingLesson, CallRecordingLessonInput, CallRecordingMonth, CallRecordingMonthInput, RecordingLessonStatus } from "./types";

type MonthRow = { id: string; month_date: string; label: string; created_at: string };
type LessonRow = {
  id: string;
  month_id: string;
  call_date: string;
  title: string | null;
  vimeo_url: string;
  status: RecordingLessonStatus;
  created_at: string;
  updated_at: string;
};

const MONTH_COLUMNS = "id,month_date,label,created_at";
const LESSON_COLUMNS = "id,month_id,call_date,title,vimeo_url,status,created_at,updated_at";

export async function listRecordingLibraryForAdmin(): Promise<CallRecordingMonth[]> {
  const [months, lessons] = await Promise.all([
    supabaseAdmin().from("call_recording_months").select(MONTH_COLUMNS).order("month_date", { ascending: false }).returns<MonthRow[]>(),
    supabaseAdmin().from("call_recording_lessons").select(LESSON_COLUMNS).order("call_date", { ascending: false }).returns<LessonRow[]>(),
  ]);
  if (months.error) throw new Error(`failed to load recording months: ${months.error.message}`);
  if (lessons.error) throw new Error(`failed to load recording lessons: ${lessons.error.message}`);
  return assemble(months.data ?? [], lessons.data ?? []);
}

export async function getPublishedRecordingLibrary(): Promise<CallRecordingMonth[]> {
  const months = await listRecordingLibraryForAdmin();
  return months
    .map((month) => ({ ...month, lessons: month.lessons.filter((lesson) => lesson.status === "published") }))
    .filter((month) => month.lessons.length > 0);
}

export async function createRecordingMonth(input: CallRecordingMonthInput): Promise<CallRecordingMonth> {
  const { data, error } = await supabaseAdmin()
    .from("call_recording_months")
    .insert({ id: crypto.randomUUID(), month_date: input.monthDate, label: input.label })
    .select(MONTH_COLUMNS)
    .single<MonthRow>();
  if (error || !data) throw new Error(`failed to create recording month: ${error?.message ?? "No month returned"}`);
  return { ...monthFromRow(data), lessons: [] };
}

export async function deleteRecordingMonth(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("call_recording_months").delete().eq("id", id);
  if (error) throw new Error(`failed to delete recording month: ${error.message}`);
}

export async function createRecordingLesson(input: CallRecordingLessonInput): Promise<CallRecordingLesson> {
  const { data, error } = await supabaseAdmin()
    .from("call_recording_lessons")
    .insert({ id: crypto.randomUUID(), month_id: input.monthId, call_date: input.callDate, title: input.title, vimeo_url: input.vimeoUrl, status: input.status })
    .select(LESSON_COLUMNS)
    .single<LessonRow>();
  if (error || !data) throw new Error(`failed to create recording lesson: ${error?.message ?? "No lesson returned"}`);
  return lessonFromRow(data);
}

export async function updateRecordingLesson(id: string, input: CallRecordingLessonInput): Promise<CallRecordingLesson> {
  const { data, error } = await supabaseAdmin()
    .from("call_recording_lessons")
    .update({ month_id: input.monthId, call_date: input.callDate, title: input.title, vimeo_url: input.vimeoUrl, status: input.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(LESSON_COLUMNS)
    .maybeSingle<LessonRow>();
  if (error || !data) throw new Error(`failed to update recording lesson: ${error?.message ?? "Lesson not found"}`);
  return lessonFromRow(data);
}

export async function deleteRecordingLesson(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("call_recording_lessons").delete().eq("id", id);
  if (error) throw new Error(`failed to delete recording lesson: ${error.message}`);
}

function assemble(monthRows: MonthRow[], lessonRows: LessonRow[]): CallRecordingMonth[] {
  return monthRows.map((row) => ({
    ...monthFromRow(row),
    lessons: lessonRows.filter((lesson) => lesson.month_id === row.id).map(lessonFromRow),
  }));
}

function monthFromRow(row: MonthRow): Omit<CallRecordingMonth, "lessons"> {
  return { id: row.id, monthDate: row.month_date, label: row.label, createdAt: row.created_at };
}

function lessonFromRow(row: LessonRow): CallRecordingLesson {
  return {
    id: row.id,
    monthId: row.month_id,
    callDate: row.call_date,
    title: row.title,
    vimeoUrl: row.vimeo_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
