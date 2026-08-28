import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getHubState } from "@/lib/gamification/state";
import { addComment } from "@/lib/community/queries";
import { commentAuthorEmail, notifyForComment } from "@/lib/community/notifications";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const MAX_COMMENT_LENGTH = 5_000;
const MAX_COMMENT_BYTES = 8 * 1024;

// Add a comment to a post. Any signed-in member. Next 16: ctx.params is a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "invalid_post" }, { status: 400 });
  let body: { body?: string; parentId?: string | null };
  try {
    const value = await readJsonBody(req, MAX_COMMENT_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as typeof body;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "too_large" : "invalid_body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > MAX_COMMENT_LENGTH) return NextResponse.json({ error: "too_long" }, { status: 400 });
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId && parentId.length > 160) return NextResponse.json({ error: "invalid_parent" }, { status: 400 });

  try {
    const rate = await consumeRateLimit("community-comment", session.email, { limit: 30, windowSeconds: 60 * 60 });
    if (!rate.allowed) return NextResponse.json({ error: "rate_limit", resetsAt: rate.resetsAt }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  const hub = await getHubState(session.email);
  const author = {
    email: session.email,
    name: hub.player.name,
    initials: hub.player.initials,
    handle: session.email.split("@")[0],
    level: hub.player.level,
    avatarUrl: hub.player.avatarUrl,
  };

  const comment = await addComment(id, author, text, parentId);
  if (!comment) return NextResponse.json({ error: "comment_failed" }, { status: 500 });

  // Notify @mentions + whoever this replies to. Best-effort — never fails the comment.
  const replyToEmail = parentId ? await commentAuthorEmail(parentId) : null;
  await notifyForComment(author, id, comment.id, text, replyToEmail);

  return NextResponse.json({ comment }, { status: 201 });
}
