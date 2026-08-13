-- 1500 Blueprint — Community board (Skool-style feed: posts, comments, likes).
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to re-run (idempotent).
--
-- Access model: every read/write goes through the service-role key, server-side
-- only (lib/community/queries.ts + app/api/community/*). The publishable/anon key
-- never touches these tables, so RLS is enabled with NO policies or grants — same
-- lockdown as auth.sql, drills.sql, and flashcard_sets.sql.
--
-- Author display fields (name/initials/handle/level) are SNAPSHOT onto each post
-- and comment at write time, so the feed renders from one table with no users
-- join. Images are stored in the existing public "figures" bucket under a
-- community/ prefix (see app/api/community/upload/route.ts).

-- ---------------------------------------------------------------------------
-- 1. community_posts — one row per post.
-- ---------------------------------------------------------------------------
create table if not exists public.community_posts (
  id              text primary key default gen_random_uuid()::text,
  author_email    text not null,
  author_name     text not null default '',
  author_initials text not null default '',
  author_handle   text not null default '',
  author_level    int  not null default 1,
  category        text not null default 'general',  -- general|scores|assignments|questions|wins|plans
  body            text not null default '',
  image_url       text,                              -- optional screenshot (figures bucket)
  view_count      int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists community_posts_created_idx  on public.community_posts(created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(category);
create index if not exists community_posts_author_idx   on public.community_posts(author_email);

-- Pinning: see supabase/migrations/20260812143000_add_community_posts_pinned.sql
-- (adds `pinned boolean not null default false`). Admin-only; pinned posts
-- float to the top of the feed regardless of category filter.

-- ---------------------------------------------------------------------------
-- 2. community_comments — one row per comment (flat; replies deleted-cascade).
-- ---------------------------------------------------------------------------
create table if not exists public.community_comments (
  id              text primary key default gen_random_uuid()::text,
  post_id         text not null references public.community_posts(id) on delete cascade,
  author_email    text not null,
  author_name     text not null default '',
  author_initials text not null default '',
  author_handle   text not null default '',
  author_level    int  not null default 1,
  body            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists community_comments_post_idx on public.community_comments(post_id, created_at);

-- Reply threads (added 2026-07-02, idempotent upgrade — re-run this file to add).
-- One level deep: a reply's parent is always a TOP-LEVEL comment (the API
-- flattens deeper replies to the root, Instagram-style). Deleting a parent
-- cascades its replies.
alter table public.community_comments
  add column if not exists parent_id text references public.community_comments(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. community_likes — one row per (post, member). Unique constraint makes a
--    like idempotent; the toggle route inserts/deletes against it.
-- ---------------------------------------------------------------------------
create table if not exists public.community_likes (
  id         text primary key default gen_random_uuid()::text,
  post_id    text not null references public.community_posts(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (post_id, email)
);

create index if not exists community_likes_post_idx  on public.community_likes(post_id);
create index if not exists community_likes_email_idx on public.community_likes(email);

-- ---------------------------------------------------------------------------
-- Row Level Security: service-role only (no policies/grants -> anon and the
-- publishable key cannot read or write). All access is via supabaseAdmin().
-- ---------------------------------------------------------------------------
alter table public.community_posts    enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes    enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic view increment (avoids a read-modify-write race on post-detail loads).
-- ---------------------------------------------------------------------------
create or replace function public.increment_post_views(pid text)
returns void
language sql
as $$
  update public.community_posts set view_count = view_count + 1 where id = pid;
$$;

-- ---------------------------------------------------------------------------
-- Top members this week by post count (drives the community right rail).
-- ---------------------------------------------------------------------------
create or replace function public.community_top_members(lim int default 4)
returns table (
  author_email    text,
  author_name     text,
  author_initials text,
  author_level    int,
  post_count      bigint
)
language sql
stable
as $$
  select author_email,
         max(author_name)     as author_name,
         max(author_initials) as author_initials,
         max(author_level)    as author_level,
         count(*)             as post_count
  from public.community_posts
  where created_at > now() - interval '7 days'
  group by author_email
  order by post_count desc, max(created_at) desc
  limit lim;
$$;

-- Force PostgREST to reload its schema cache so the new tables/functions are
-- reachable immediately over the API (otherwise the first requests can 404).
notify pgrst, 'reload schema';
