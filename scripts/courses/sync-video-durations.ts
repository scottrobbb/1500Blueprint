/**
 * Corrects course_lessons.estimated_minutes to match each lesson's real
 * video length instead of the flat 15/8-minute placeholder import-scott-
 * courses.ts assigned every lesson. Reads the actual duration from Vimeo
 * (public oEmbed, no credentials needed) or Google Drive (via the same
 * service account already used for Calendar sync — the Drive API must be
 * enabled on that Google Cloud project first).
 *
 * Lessons with more than one video block get the sum of those durations.
 * A lesson is left untouched if any of its video durations can't be
 * resolved, so a transient API failure never writes a wrong guess.
 *
 * npx tsx --env-file=.env.local scripts/courses/sync-video-durations.ts
 * npx tsx --env-file=.env.local scripts/courses/sync-video-durations.ts --write
 */
import { SignJWT, importPKCS8 } from "jose";
import { supabaseAdmin } from "../../utils/supabase/admin";

type BlockRow = { id: string; lesson_id: string; content: { url?: string } };
type LessonRow = { id: string; title: string; estimated_minutes: number };

async function main() {
  const write = process.argv.includes("--write");
  const db = supabaseAdmin();

  const { data: blocks, error: blocksError } = await db
    .from("course_lesson_blocks")
    .select("id,lesson_id,content")
    .eq("kind", "video")
    .returns<BlockRow[]>();
  if (blocksError) throw new Error(`failed to load video blocks: ${blocksError.message}`);
  if (!blocks || blocks.length === 0) {
    console.log("No video blocks found.");
    return;
  }

  const lessonIds = [...new Set(blocks.map((block) => block.lesson_id))];
  const { data: lessons, error: lessonsError } = await db
    .from("course_lessons")
    .select("id,title,estimated_minutes")
    .in("id", lessonIds)
    .returns<LessonRow[]>();
  if (lessonsError) throw new Error(`failed to load lessons: ${lessonsError.message}`);
  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));

  const durationCache = new Map<string, number | null>();
  for (const block of blocks) {
    const url = block.content?.url;
    if (!url || durationCache.has(url)) continue;
    durationCache.set(url, await fetchDurationSeconds(url));
  }

  const totalsByLesson = new Map<string, number>();
  const missingByLesson = new Map<string, number>();
  for (const block of blocks) {
    const url = block.content?.url;
    const seconds = url ? durationCache.get(url) : null;
    if (seconds == null) {
      missingByLesson.set(block.lesson_id, (missingByLesson.get(block.lesson_id) ?? 0) + 1);
      continue;
    }
    totalsByLesson.set(block.lesson_id, (totalsByLesson.get(block.lesson_id) ?? 0) + seconds);
  }

  const updates: { id: string; title: string; from: number; to: number }[] = [];
  for (const [lessonId, totalSeconds] of totalsByLesson) {
    if (missingByLesson.has(lessonId)) continue;
    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
    if (minutes !== lesson.estimated_minutes) {
      updates.push({ id: lessonId, title: lesson.title, from: lesson.estimated_minutes, to: minutes });
    }
  }

  console.log(`${updates.length} lesson(s) need a duration correction:`);
  for (const update of updates) console.log(`  ${update.title}: ${update.from} -> ${update.to} min`);
  for (const [lessonId, count] of missingByLesson) {
    console.log(`  Skipped "${lessonById.get(lessonId)?.title ?? lessonId}": could not resolve ${count} video block(s).`);
  }

  if (!write) {
    console.log("\nDry run only. Re-run with --write to apply.");
    return;
  }
  for (const update of updates) {
    const { error } = await db.from("course_lessons").update({ estimated_minutes: update.to }).eq("id", update.id);
    if (error) console.error(`  Failed to update ${update.title}: ${error.message}`);
  }
  console.log(`Updated ${updates.length} lesson(s).`);
}

async function fetchDurationSeconds(url: string): Promise<number | null> {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("vimeo.com")) return await vimeoDurationSeconds(url);
    if (parsed.hostname === "drive.google.com") return await driveDurationSeconds(url);
  } catch {
    return null;
  }
  return null;
}

async function vimeoDurationSeconds(url: string): Promise<number | null> {
  const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { duration?: number } | null;
  return typeof body?.duration === "number" ? body.duration : null;
}

async function driveDurationSeconds(url: string): Promise<number | null> {
  const id = new URL(url).pathname.match(/\/file\/d\/([^/]+)/)?.[1];
  if (!id) return null;
  const token = await driveAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=videoMediaMetadata`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { videoMediaMetadata?: { durationMillis?: string } } | null;
  const millis = body?.videoMediaMetadata?.durationMillis;
  return millis ? Math.round(Number(millis) / 1000) : null;
}

let cachedDriveToken: { token: string; expiresAt: number } | null = null;

async function driveAccessToken(): Promise<string> {
  if (cachedDriveToken && cachedDriveToken.expiresAt > Date.now()) return cachedDriveToken.token;
  const email = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.trim();
  if (!email || !rawKey) throw new Error("Missing GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY for Drive access.");
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  let assertion = new SignJWT({ scope: "https://www.googleapis.com/auth/drive.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600);
  const impersonatedUser = process.env.GOOGLE_CALENDAR_IMPERSONATE_USER?.trim();
  if (impersonatedUser) assertion = assertion.setSubject(impersonatedUser);
  const jwt = await assertion.sign(await importPKCS8(privateKey, "RS256"));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!response.ok || !body?.access_token) throw new Error(body?.error_description ?? "Drive authentication failed.");
  cachedDriveToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - 60_000 };
  return cachedDriveToken.token;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
