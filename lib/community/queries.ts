// Server-only data layer for the community board. Uses the service-role key
// (supabaseAdmin) which bypasses RLS, so callers MUST authorize first
// (getSession / moderation checks) — never import this into a Client Component.
// Mirrors lib/flashcards/queries.ts.

import { supabaseAdmin } from "@/utils/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import type {
  Author,
  CommenterAvatar,
  CommunityCategory,
  CommunityPost,
  PostComment,
  TopMember,
} from "./types";

// Author snapshot written onto a post/comment (email + display fields). The
// snapshot never includes the avatar — that's joined live from users.avatar_url
// so a changed pfp shows everywhere — but the writer passes its current avatarUrl
// through so the freshly-created row renders with a photo without a re-fetch.
export type PostAuthor = Author & { email: string };

type PostRow = {
  id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  author_handle: string;
  author_level: number;
  category: string;
  body: string;
  image_url: string | null;
  view_count: number;
  created_at: string;
  // Absent on rows fetched via POST_SELECT_FALLBACK (pre-migration DB) or
  // POST_BASE alone (createPost) — mapPost treats that as false.
  pinned?: boolean;
  community_comments?: { count: number }[] | null;
  community_likes?: { count: number }[] | null;
  // Each post's own newest-first slice (referencedTable order/limit in listPosts),
  // used for the feed footer's "recent commenters" avatar stack. Absent on rows
  // fetched via POST_BASE alone (createPost) — mapPost treats that as [].
  recent_comments?: { author_email: string; author_initials: string; created_at: string }[] | null;
};

type CommentRow = {
  id: string;
  author_email: string;
  author_name: string;
  author_initials: string;
  author_handle: string;
  author_level: number;
  body: string;
  /** Absent until the reply migration (community.sql re-run) has been applied. */
  parent_id?: string | null;
  created_at: string;
};

const POST_BASE =
  "id,author_email,author_name,author_initials,author_handle,author_level,category,body,image_url,view_count,created_at";
// recent_comments is an aliased second embed of the same comments table so
// PostgREST returns each post's own newest-first slice (referencedTable
// order/limit in listPosts) — no separate query needed for the avatar stack.
const POST_SELECT =
  `${POST_BASE},pinned,community_comments(count),community_likes(count),` +
  `recent_comments:community_comments(author_email,author_initials,created_at)`;
// Pre-redesign select shape (no pinned, no recent_comments embed). listPosts/
// getPost fall back to this if the enhanced select errors — e.g. the pinned
// column or the aliased embed isn't actually live on this DB yet — so a lagging
// migration can never take the whole feed down to "no posts".
const POST_SELECT_FALLBACK = `${POST_BASE},community_comments(count),community_likes(count)`;

// Comments select "*" (not an explicit column list) so the same code works
// before AND after the reply migration adds parent_id — a listed-but-missing
// column would error the whole query. mapComment reads parent_id defensively.
const COMMENT_SELECT = "*";

// Relative timestamp for the feed ("now", "3h", "2d", "Jul 1"). Exported so the
// notifications layer renders timestamps identically.
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// First 3 DISTINCT commenters from a newest-first slice, resolving each one's
// avatar from the same batch lookup used for the post author.
function dedupeCommenters(
  rows: { author_email: string; author_initials: string }[],
  avatars: Map<string, string | null>,
  limit = 3,
): CommenterAvatar[] {
  const seen = new Set<string>();
  const out: CommenterAvatar[] = [];
  for (const r of rows) {
    if (seen.has(r.author_email)) continue;
    seen.add(r.author_email);
    out.push({ initials: r.author_initials, avatarUrl: avatars.get(r.author_email) ?? null });
    if (out.length >= limit) break;
  }
  return out;
}

function mapPost(row: PostRow, liked: Set<string>, avatars: Map<string, string | null>): CommunityPost {
  const recent = row.recent_comments ?? [];
  return {
    id: row.id,
    author: {
      name: row.author_name,
      handle: row.author_handle,
      initials: row.author_initials,
      level: row.author_level,
      avatarUrl: avatars.get(row.author_email) ?? null,
    },
    authorHandle: row.author_handle,
    category: row.category as CommunityCategory,
    timeAgo: relativeTime(row.created_at),
    body: row.body,
    shot: row.image_url
      ? { kind: "image", url: row.image_url, alt: `Screenshot from ${row.author_name}` }
      : undefined,
    likes: row.community_likes?.[0]?.count ?? 0,
    liked: liked.has(row.id),
    commentCount: row.community_comments?.[0]?.count ?? 0,
    views: row.view_count,
    pinned: row.pinned ?? false,
    recentCommenters: dedupeCommenters(recent, avatars),
    lastCommentAt: recent[0] ? relativeTime(recent[0].created_at) : null,
  };
}

function mapComment(row: CommentRow, avatarUrl: string | null = null): PostComment {
  return {
    id: row.id,
    author: {
      name: row.author_name,
      handle: row.author_handle,
      initials: row.author_initials,
      level: row.author_level,
      avatarUrl,
    },
    authorHandle: row.author_handle,
    timeAgo: relativeTime(row.created_at),
    body: row.body,
    parentId: row.parent_id ?? null,
  };
}

// Which of the given post ids the viewer has liked.
async function likedIdsFor(email: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data } = await supabaseAdmin()
    .from("community_likes")
    .select("post_id")
    .eq("email", email)
    .in("post_id", postIds);
  return new Set((data as { post_id: string }[] | null)?.map((r) => r.post_id) ?? []);
}

// Current profile photos for a set of author emails, joined from users.avatar_url
// at read time (author rows only snapshot name/initials/level). Defensive: any
// error yields an empty map, so authors fall back to their initials.
async function avatarsByEmail(emails: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(emails)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("email,avatar_url")
    .in("email", unique)
    .returns<{ email: string; avatar_url: string | null }[]>();
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.email, r.avatar_url ?? null]));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPosts(
  viewerEmail: string,
  category?: CommunityCategory,
): Promise<CommunityPost[]> {
  const db = supabaseAdmin();
  let query = db
    .from("community_posts")
    .select(POST_SELECT)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: false, referencedTable: "recent_comments" })
    .limit(6, { referencedTable: "recent_comments" })
    .limit(100);
  if (category) query = query.eq("category", category);

  const primary = await query.returns<PostRow[]>();
  let rows: PostRow[];
  if (primary.error) {
    console.error("listPosts: enhanced select failed, falling back:", primary.error.message);
    let fallback = db
      .from("community_posts")
      .select(POST_SELECT_FALLBACK)
      .order("created_at", { ascending: false })
      .limit(100);
    if (category) fallback = fallback.eq("category", category);
    const backup = await fallback.returns<PostRow[]>();
    if (backup.error) throw new Error(`listPosts failed: ${backup.error.message}`);
    rows = backup.data ?? [];
  } else {
    rows = primary.data ?? [];
  }
  const emails = new Set<string>();
  for (const r of rows) {
    emails.add(r.author_email);
    for (const c of r.recent_comments ?? []) emails.add(c.author_email);
  }
  const [liked, avatars] = await Promise.all([
    likedIdsFor(viewerEmail, rows.map((r) => r.id)),
    avatarsByEmail([...emails]),
  ]);
  return rows.map((r) => mapPost(r, liked, avatars));
}

export async function getPost(id: string, viewerEmail: string): Promise<CommunityPost | null> {
  const db = supabaseAdmin();
  const primary = await db.from("community_posts").select(POST_SELECT).eq("id", id).maybeSingle().returns<PostRow>();
  let row: PostRow | null;
  if (primary.error) {
    console.error("getPost: enhanced select failed, falling back:", primary.error.message);
    const backup = await db
      .from("community_posts")
      .select(POST_SELECT_FALLBACK)
      .eq("id", id)
      .maybeSingle()
      .returns<PostRow>();
    if (backup.error) throw new Error(`getPost failed: ${backup.error.message}`);
    row = backup.data;
  } else {
    row = primary.data;
  }
  if (!row) return null;

  // Load likes + the thread and bump the view counter in parallel. The increment
  // is best-effort — a failure (or a missing function pre-migration) never breaks
  // the render.
  const [liked, { data: comments }] = await Promise.all([
    likedIdsFor(viewerEmail, [id]),
    db.from("community_comments").select(COMMENT_SELECT).eq("post_id", id).order("created_at", { ascending: true }),
    db.rpc("increment_post_views", { pid: id }).then(
      () => {},
      () => {},
    ),
  ]);
  const commentRows = (comments as CommentRow[] | null) ?? [];

  // One avatar lookup covers the post author and every commenter.
  const avatars = await avatarsByEmail([row.author_email, ...commentRows.map((c) => c.author_email)]);
  const post = mapPost(row, liked, avatars);
  post.comments = commentRows.map((c) => mapComment(c, avatars.get(c.author_email) ?? null));

  return post;
}

export async function listTopMembers(limit = 4): Promise<TopMember[]> {
  const { data } = await supabaseAdmin().rpc("community_top_members", { lim: limit });
  const rows = (data as
    | { author_email: string; author_name: string; author_initials: string; author_level: number; post_count: number }[]
    | null) ?? [];
  const avatars = await avatarsByEmail(rows.map((r) => r.author_email));
  return rows.map((r) => ({
    name: r.author_name,
    initials: r.author_initials,
    level: r.author_level,
    postCount: Number(r.post_count),
    avatarUrl: avatars.get(r.author_email) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Moderation checks
// ---------------------------------------------------------------------------

export async function canModeratePost(id: string, email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const { data } = await supabaseAdmin()
    .from("community_posts")
    .select("author_email")
    .eq("id", id)
    .maybeSingle();
  return (data as { author_email: string } | null)?.author_email === email;
}

export async function canModerateComment(id: string, email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const { data } = await supabaseAdmin()
    .from("community_comments")
    .select("author_email")
    .eq("id", id)
    .maybeSingle();
  return (data as { author_email: string } | null)?.author_email === email;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createPost(
  author: PostAuthor,
  input: { category: CommunityCategory; body: string; imageUrl: string | null },
): Promise<CommunityPost | null> {
  const { data, error } = await supabaseAdmin()
    .from("community_posts")
    .insert({
      author_email: author.email,
      author_name: author.name,
      author_initials: author.initials,
      author_handle: author.handle,
      author_level: author.level,
      category: input.category,
      body: input.body,
      image_url: input.imageUrl,
    })
    .select(POST_BASE)
    .single();
  if (error || !data) return null;
  const post = mapPost(data as PostRow, new Set(), new Map([[author.email, author.avatarUrl ?? null]]));
  post.comments = [];
  return post;
}

export async function deletePost(id: string): Promise<void> {
  await supabaseAdmin().from("community_posts").delete().eq("id", id); // comments + likes cascade
}

export async function addComment(
  postId: string,
  author: PostAuthor,
  body: string,
  parentId: string | null = null,
): Promise<PostComment | null> {
  const db = supabaseAdmin();

  // Threads are one level deep: validate the parent belongs to this post, and
  // if the target is itself a reply, attach to ITS parent (Instagram-style).
  let resolvedParent: string | null = null;
  if (parentId) {
    const { data: parent } = await db
      .from("community_comments")
      .select("id,post_id,parent_id")
      .eq("id", parentId)
      .maybeSingle();
    const p = parent as { id: string; post_id: string; parent_id: string | null } | null;
    if (!p || p.post_id !== postId) return null;
    resolvedParent = p.parent_id ?? p.id;
  }

  // parent_id is only included for replies, so top-level comments keep working
  // on a DB that predates the reply migration (re-running community.sql adds it).
  const row: Record<string, unknown> = {
    post_id: postId,
    author_email: author.email,
    author_name: author.name,
    author_initials: author.initials,
    author_handle: author.handle,
    author_level: author.level,
    body,
  };
  if (resolvedParent) row.parent_id = resolvedParent;

  const { data, error } = await db
    .from("community_comments")
    .insert(row)
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) return null;
  return mapComment(data as CommentRow, author.avatarUrl ?? null);
}

export async function deleteComment(id: string): Promise<void> {
  await supabaseAdmin().from("community_comments").delete().eq("id", id);
}

// Toggle a like for (post, email); returns the new state + fresh count.
export async function toggleLike(
  postId: string,
  email: string,
): Promise<{ liked: boolean; likes: number }> {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("community_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("email", email)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await db.from("community_likes").delete().eq("id", (existing as { id: string }).id);
    liked = false;
  } else {
    await db.from("community_likes").insert({ post_id: postId, email });
    liked = true;
  }

  const { count } = await db
    .from("community_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);
  return { liked, likes: count ?? 0 };
}

// Admin-only pin toggle — the role check lives in the route
// (app/api/community/posts/[id]/pin/route.ts), not here.
export async function togglePinned(id: string): Promise<{ pinned: boolean }> {
  const db = supabaseAdmin();
  const { data } = await db.from("community_posts").select("pinned").eq("id", id).maybeSingle();
  const next = !(data as { pinned: boolean } | null)?.pinned;
  await db.from("community_posts").update({ pinned: next }).eq("id", id);
  return { pinned: next };
}
