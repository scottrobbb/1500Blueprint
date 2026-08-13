alter table public.community_posts
  add column if not exists pinned boolean not null default false;
