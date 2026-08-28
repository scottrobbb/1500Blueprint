-- Paid SAT content must never be queryable with the browser-visible Supabase
-- key. Student pages and route handlers authorize the session and plan first,
-- then read these tables through the server-only service-role client.

alter table public.tests enable row level security;
alter table public.modules enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.drills enable row level security;
alter table public.drill_questions enable row level security;
alter table public.drill_walkthrough_steps enable row level security;

drop policy if exists "public read tests" on public.tests;
drop policy if exists "public read published tests" on public.tests;
drop policy if exists "public read modules" on public.modules;
drop policy if exists "public read published test modules" on public.modules;
drop policy if exists "public read questions" on public.questions;
drop policy if exists "public read published test questions" on public.questions;
drop policy if exists "public read choices" on public.choices;
drop policy if exists "public read published test choices" on public.choices;

drop policy if exists "public read drills" on public.drills;
drop policy if exists "public read published drills" on public.drills;
drop policy if exists "public read pub questions" on public.drill_questions;
drop policy if exists "public read published drill questions" on public.drill_questions;
drop policy if exists "public read pub steps" on public.drill_walkthrough_steps;
drop policy if exists "public read published drill steps" on public.drill_walkthrough_steps;

revoke all privileges on table
  public.tests,
  public.modules,
  public.questions,
  public.choices,
  public.drills,
  public.drill_questions,
  public.drill_walkthrough_steps
from public, anon, authenticated;

grant select on table
  public.tests,
  public.modules,
  public.questions,
  public.choices,
  public.drills,
  public.drill_questions,
  public.drill_walkthrough_steps
to service_role;

-- Course resources were previously uploaded to a public bucket. Existing
-- object paths remain stable, but student/admin course readers now exchange
-- those stored paths for short-lived signed URLs after authorization.
update storage.buckets
set public = false
where id = 'course-assets';
