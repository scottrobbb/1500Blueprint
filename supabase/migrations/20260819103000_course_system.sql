-- 1500 Ultimate course curriculum, lesson media, and persistent completion.

create table if not exists public.courses (
  id                text primary key default gen_random_uuid()::text,
  slug              text not null unique,
  title             text not null,
  description       text,
  eyebrow           text,
  cover_url         text,
  position          integer not null default 1,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.course_modules (
  id          text primary key default gen_random_uuid()::text,
  course_id   text not null references public.courses(id) on delete cascade,
  slug        text not null,
  title       text not null,
  description text,
  position    integer not null,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  unique(course_id, slug)
);

create table if not exists public.course_lessons (
  id                text primary key default gen_random_uuid()::text,
  module_id         text not null references public.course_modules(id) on delete cascade,
  slug              text not null,
  title             text not null,
  summary           text,
  position          integer not null,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  unique(module_id, slug)
);

create table if not exists public.course_lesson_blocks (
  id        text primary key default gen_random_uuid()::text,
  lesson_id text not null references public.course_lessons(id) on delete cascade,
  position  integer not null,
  kind      text not null check (kind in ('text', 'video', 'image', 'file')),
  content   jsonb not null default '{}'::jsonb
);

create table if not exists public.course_lesson_completions (
  email        text not null references public.users(email) on delete cascade,
  lesson_id    text not null references public.course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (email, lesson_id)
);

create index if not exists courses_status_position_idx on public.courses(status, position);
create index if not exists course_modules_course_position_idx on public.course_modules(course_id, position);
create index if not exists course_lessons_module_position_idx on public.course_lessons(module_id, position);
create index if not exists course_lesson_blocks_lesson_position_idx on public.course_lesson_blocks(lesson_id, position);
create index if not exists course_lesson_completions_email_idx on public.course_lesson_completions(email, completed_at desc);

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_lesson_blocks enable row level security;
alter table public.course_lesson_completions enable row level security;

revoke all on table public.courses from public, anon, authenticated;
revoke all on table public.course_modules from public, anon, authenticated;
revoke all on table public.course_lessons from public, anon, authenticated;
revoke all on table public.course_lesson_blocks from public, anon, authenticated;
revoke all on table public.course_lesson_completions from public, anon, authenticated;
grant select, insert, update, delete on table public.courses to service_role;
grant select, insert, update, delete on table public.course_modules to service_role;
grant select, insert, update, delete on table public.course_lessons to service_role;
grant select, insert, update, delete on table public.course_lesson_blocks to service_role;
grant select, insert, update, delete on table public.course_lesson_completions to service_role;
