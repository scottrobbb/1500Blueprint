-- A student's choice to move down one level in the Reading Comprehension
-- Drill. Reading levels are rebuilt by replaying drill_attempts in order
-- (lib/drills/readingProgress.ts); each row here is replayed at its moment as
-- "down one level, streak reset". Kept out of drill_attempts so it never counts
-- as a drill toward XP, daily goals, or achievements.
create table public.reading_level_drops (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.users(email) on delete cascade,
  client_token text not null,
  created_at timestamptz not null default now(),
  unique (email, client_token)
);
create index reading_level_drops_email_time on public.reading_level_drops(email, created_at);
alter table public.reading_level_drops enable row level security;
revoke all on public.reading_level_drops from public, anon, authenticated;
grant select, insert, update, delete on public.reading_level_drops to service_role;
