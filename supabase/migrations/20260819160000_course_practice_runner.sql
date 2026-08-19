-- Native course practices authored inside lesson blocks, with persistent student attempts.

alter table public.course_lesson_blocks
  drop constraint if exists course_lesson_blocks_kind_check;

alter table public.course_lesson_blocks
  add constraint course_lesson_blocks_kind_check
  check (kind in ('text', 'video', 'image', 'file', 'practice'));

create table if not exists public.course_practice_attempts (
  id             uuid primary key default gen_random_uuid(),
  email          text not null references public.users(email) on delete cascade,
  lesson_id      text not null references public.course_lessons(id) on delete cascade,
  block_id       text not null references public.course_lesson_blocks(id) on delete cascade,
  answers        jsonb not null default '[]'::jsonb,
  score          smallint not null check (score between 0 and 100),
  correct_count  integer not null check (correct_count >= 0),
  question_count integer not null check (question_count > 0),
  passed         boolean not null default false,
  completed_at   timestamptz not null default now()
);

create index if not exists course_practice_attempts_email_block_idx
  on public.course_practice_attempts(email, block_id, completed_at desc);

alter table public.course_practice_attempts enable row level security;
revoke all on table public.course_practice_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.course_practice_attempts to service_role;
