// Data model for the community board. Modeled on Whop's community feed (the
// closest shipped analog to Scott's Skool). These are the runtime shapes the
// components render; lib/community/queries.ts maps the Supabase rows into them.

export type CommunityCategory =
  | "general"
  | "scores"
  | "assignments"
  | "questions"
  | "wins"
  | "plans";

// An uploaded screenshot attached to a post.
export type PostShot = { kind: "image"; url: string; alt: string };

export type Author = {
  name: string;
  handle: string;
  initials: string;
  level: number;
  // Current profile photo, joined from users.avatar_url at read time (not
  // snapshot on the row) so a student's new pfp shows on their old posts too.
  avatarUrl?: string | null;
};

export type PostComment = {
  id: string;
  author: Author;
  authorHandle: string; // for the "can I delete this" check on the client
  timeAgo: string;
  body: string;
  /** Top-level comment id this is a reply to; null for a top-level comment. */
  parentId: string | null;
};

// A commenter's face for the list-card "recent commenters" avatar stack — just
// enough to render an <Avatar>, not a full Author (no name/handle/level needed).
export type CommenterAvatar = { initials: string; avatarUrl?: string | null };

export type CommunityPost = {
  id: string;
  author: Author;
  authorHandle: string; // duplicated flat for the client delete check
  category: CommunityCategory;
  timeAgo: string;
  body: string;
  shot?: PostShot;
  likes: number;
  liked: boolean;
  commentCount: number;
  views: number;
  comments?: PostComment[];
  pinned: boolean;
  // Populated by listPosts only (for the feed footer); absent/empty elsewhere.
  recentCommenters?: CommenterAvatar[];
  lastCommentAt?: string | null;
};

// A homepage notification: someone @mentioned you, or replied to your comment.
// Rendered by the AppNav bell (components/shell/NotificationBell).
export type CommunityNotification = {
  id: string;
  kind: "mention" | "reply";
  actorName: string;
  actorHandle: string;
  postId: string | null;
  excerpt: string;
  timeAgo: string;
  read: boolean;
};

// Right-rail "top members this week".
export type TopMember = {
  name: string;
  initials: string;
  level: number;
  postCount: number;
  avatarUrl?: string | null;
};

// Category display config: filter label + the breadcrumb dot color. One place to
// tune the palette; every card + chip reads from here.
export const CATEGORY: Record<CommunityCategory, { label: string; dot: string }> = {
  general: { label: "General", dot: "bg-navy/40" },
  scores: { label: "Score Drops", dot: "bg-gold-600" },
  assignments: { label: "Assignment Submissions", dot: "bg-flag" },
  questions: { label: "Questions", dot: "bg-brand" },
  wins: { label: "Wins", dot: "bg-success" },
  plans: { label: "Study Plans", dot: "bg-[#7c6cff]" },
};

// Filter order for the chip row (All + each category).
export const CATEGORY_ORDER: CommunityCategory[] = [
  "general",
  "scores",
  "assignments",
  "questions",
  "wins",
  "plans",
];

export function isCategory(value: unknown): value is CommunityCategory {
  return typeof value === "string" && (CATEGORY_ORDER as string[]).includes(value);
}
