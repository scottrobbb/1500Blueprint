-- Weekly live-call scheduling and scoped explanation-editor access.

create table if not exists public.weekly_calls (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  focus_topic text,
  host_name text not null default 'Scott Robinson',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/New_York',
  meeting_url text,
  recording_url text,
  google_event_id text,
  google_calendar_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists weekly_calls_google_event_idx
  on public.weekly_calls(google_event_id)
  where google_event_id is not null;
create index if not exists weekly_calls_status_start_idx
  on public.weekly_calls(status, starts_at);

create table if not exists public.staff_roles (
  email text not null references public.users(email) on update cascade on delete cascade,
  role text not null check (role in ('explanation_editor')),
  granted_by text not null,
  created_at timestamptz not null default now(),
  primary key (email, role)
);

create index if not exists staff_roles_role_idx on public.staff_roles(role, created_at desc);

create table if not exists public.explanation_edit_log (
  id text primary key default gen_random_uuid()::text,
  editor_email text not null,
  target_type text not null check (target_type in ('question_bank', 'practice_test')),
  target_id text not null,
  prior_explanation text,
  next_explanation text not null,
  created_at timestamptz not null default now()
);

create index if not exists explanation_edit_log_target_idx
  on public.explanation_edit_log(target_type, target_id, created_at desc);
create index if not exists explanation_edit_log_editor_idx
  on public.explanation_edit_log(editor_email, created_at desc);

alter table public.weekly_calls enable row level security;
alter table public.staff_roles enable row level security;
alter table public.explanation_edit_log enable row level security;

revoke all on table public.weekly_calls from public, anon, authenticated;
revoke all on table public.staff_roles from public, anon, authenticated;
revoke all on table public.explanation_edit_log from public, anon, authenticated;

grant select, insert, update, delete on table public.weekly_calls to service_role;
grant select, insert, update, delete on table public.staff_roles to service_role;
grant select, insert, update, delete on table public.explanation_edit_log to service_role;

create or replace function public.update_staff_explanation(
  p_editor_email text,
  p_target_type text,
  p_target_id text,
  p_explanation text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  prior_value text;
begin
  if p_target_type = 'question_bank' then
    select q.explanation into prior_value
    from public.drill_questions q
    join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
    where q.id = p_target_id
    for update of q;
    if not found then raise exception 'Question Bank item not found'; end if;
    update public.drill_questions set explanation = p_explanation, updated_at = now() where id = p_target_id;
  elsif p_target_type = 'practice_test' then
    select q.explanation into prior_value
    from public.questions q
    where q.id = p_target_id
    for update;
    if not found then raise exception 'Practice-test question not found'; end if;
    update public.questions
      set explanation = p_explanation, explanation_source = 'human'
      where id = p_target_id;
  else
    raise exception 'Unsupported explanation target';
  end if;

  insert into public.explanation_edit_log (
    editor_email, target_type, target_id, prior_explanation, next_explanation
  ) values (
    lower(trim(p_editor_email)), p_target_type, p_target_id, prior_value, p_explanation
  );
end;
$$;

revoke all on function public.update_staff_explanation(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_staff_explanation(text, text, text, text)
  to service_role;

comment on table public.weekly_calls is
  'Admin-authored Ultimate live calls with optional Google Calendar and Meet synchronization.';
comment on table public.staff_roles is
  'Scoped staff authorization. Explanation editors can update explanations but not answers or question content.';
comment on table public.explanation_edit_log is
  'Append-only audit trail for explanation-only content changes.';
