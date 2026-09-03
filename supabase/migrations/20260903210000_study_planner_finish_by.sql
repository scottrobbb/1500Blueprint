-- A finish-by date sits before the SAT date and marks when the required work
-- has to be done. Plans record the compression that made the deadline fit, plus
-- the timestamp of any manual reschedule the student applied to the week.

alter table public.study_planner_profiles
  add column if not exists finish_by date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_planner_profiles_finish_by_check'
  ) then
    alter table public.study_planner_profiles
      add constraint study_planner_profiles_finish_by_check
      check (finish_by is null or finish_by <= test_date);
  end if;
end
$$;

alter table public.study_planner_plans
  add column if not exists finish_by date,
  add column if not exists compression jsonb not null default '{}'::jsonb,
  add column if not exists customized_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_planner_plans_finish_by_check'
  ) then
    alter table public.study_planner_plans
      add constraint study_planner_plans_finish_by_check
      check (finish_by is null or finish_by <= test_date);
  end if;
end
$$;

-- Manual rescheduling renumbers every task in the plan with one statement, so
-- the position uniqueness has to hold at commit rather than row by row. The
-- constraint was declared inline, so find it by the columns it covers rather
-- than by trusting the name PostgreSQL generated for it.
do $$
declare
  target_columns smallint[];
  existing_name text;
  is_deferrable boolean;
begin
  select array_agg(att.attnum order by att.attnum)
    into target_columns
  from pg_attribute att
  where att.attrelid = 'public.study_planner_tasks'::regclass
    and att.attname in ('plan_id', 'position')
    and att.attnum > 0
    and not att.attisdropped;

  select con.conname, con.condeferrable
    into existing_name, is_deferrable
  from pg_constraint con
  where con.conrelid = 'public.study_planner_tasks'::regclass
    and con.contype = 'u'
    and (select array_agg(key order by key) from unnest(con.conkey) as key) = target_columns;

  if existing_name is not null and is_deferrable then
    return;
  end if;

  if existing_name is not null then
    execute format('alter table public.study_planner_tasks drop constraint %I', existing_name);
  end if;

  alter table public.study_planner_tasks
    add constraint study_planner_tasks_plan_id_position_key
    unique (plan_id, position) deferrable initially deferred;
end
$$;
