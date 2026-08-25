-- Vimeo recording library for weekly calls, grouped by month.

create table if not exists public.call_recording_months (
  id         text primary key default gen_random_uuid()::text,
  month_date date not null unique,
  label      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_recording_lessons (
  id         text primary key default gen_random_uuid()::text,
  month_id   text not null references public.call_recording_months(id) on delete cascade,
  title      text not null,
  vimeo_url  text not null,
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_recording_months_month_date_idx
  on public.call_recording_months(month_date desc);
create index if not exists call_recording_lessons_month_created_idx
  on public.call_recording_lessons(month_id, created_at);
create index if not exists call_recording_lessons_status_idx
  on public.call_recording_lessons(status);

alter table public.call_recording_months enable row level security;
alter table public.call_recording_lessons enable row level security;

revoke all on table public.call_recording_months from public, anon, authenticated;
revoke all on table public.call_recording_lessons from public, anon, authenticated;

grant select, insert, update, delete on table public.call_recording_months to service_role;
grant select, insert, update, delete on table public.call_recording_lessons to service_role;

comment on table public.call_recording_months is
  'Calendar months used to group weekly-call Vimeo recordings for Max students.';
comment on table public.call_recording_lessons is
  'Individual Vimeo recording entries within a call_recording_months group.';
