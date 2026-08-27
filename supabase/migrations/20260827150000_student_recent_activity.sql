-- Account-synced last-opened study resources for the home-page continuation.
-- Practice tests already persist exact runner state in public.test_sessions;
-- this table records lightweight reopen destinations for drills and sets.

create table if not exists public.student_recent_activity (
  email          text not null references public.users(email) on delete cascade,
  kind           text not null check (kind in ('drill', 'flashcard_set')),
  resource_id    text not null,
  metadata       jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  last_opened_at timestamptz not null default now(),
  primary key (email, kind, resource_id)
);

create index if not exists student_recent_activity_email_time_idx
  on public.student_recent_activity(email, last_opened_at desc);

-- All reads and writes go through authenticated server routes using the
-- service-role client. The browser cannot query or alter another account's
-- continuation state directly.
alter table public.student_recent_activity enable row level security;
revoke all on public.student_recent_activity from anon, authenticated;

notify pgrst, 'reload schema';
