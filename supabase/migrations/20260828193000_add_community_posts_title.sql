alter table public.community_posts
  add column if not exists title text not null default '';
