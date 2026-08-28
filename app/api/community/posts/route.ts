import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getHubState } from "@/lib/gamification/state";
import { createPost } from "@/lib/community/queries";
import { notifyForPost } from "@/lib/community/notifications";
import { containsSlur } from "@/lib/community/moderation";
import { isCategory } from "@/lib/community/types";
import { normalizeHttpUrl, readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const MAX_POST_LENGTH = 10_000;
const MAX_TITLE_LENGTH = 200;
const MAX_POST_BYTES = 16 * 1024;

// Create a community post. Any signed-in member can post; the author display
// fields are snapshot from their current hub profile.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    category?: string;
    title?: string;
    body?: string;
    imageUrl?: string | null;
  };
  try {
    const value = await readJsonBody(req, MAX_POST_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as typeof body;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "too_large" : "invalid_body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  if (title.length > MAX_TITLE_LENGTH) return NextResponse.json({ error: "title_too_long" }, { status: 400 });
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length > MAX_POST_LENGTH) return NextResponse.json({ error: "too_long" }, { status: 400 });
  const imageUrl = body.imageUrl ? normalizeHttpUrl(body.imageUrl) : null;
  if (body.imageUrl && !imageUrl) return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  if (containsSlur(title) || containsSlur(text)) return NextResponse.json({ error: "blocked_content" }, { status: 400 });

  try {
    const rate = await consumeRateLimit("community-post", session.email, { limit: 10, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  const category = isCategory(body.category) ? body.category : "general";
  const hub = await getHubState(session.email);
  const author = {
    email: session.email,
    name: hub.player.name,
    initials: hub.player.initials,
    handle: session.email.split("@")[0],
    level: hub.player.level,
    avatarUrl: hub.player.avatarUrl,
  };

  const post = await createPost(author, { category, title, body: text, imageUrl });
  if (!post) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  // Notify anyone @mentioned in the title or body. Best-effort — never fails the post.
  await notifyForPost(author, post.id, `${title}\n${text}`.trim());

  return NextResponse.json({ post }, { status: 201 });
}
