-- Database-backed publication controls for whole drills and practice tests,
-- plus Question Bank analytics that retain historical attempts after inventory
-- is unpublished or removed from the current catalog.

alter table public.drills
  add column if not exists status text not null default 'published';
alter table public.tests
  add column if not exists status text not null default 'published';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drills_status_check'
  ) then
    alter table public.drills
      add constraint drills_status_check check (status in ('draft', 'published'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tests_status_check'
  ) then
    alter table public.tests
      add constraint tests_status_check check (status in ('draft', 'published'));
  end if;
end
$$;

-- Preserve the availability that existed immediately before this migration.
update public.drills
set status = 'draft'
where slug in ('targeted-math', 'word-scan', 'ai-math');

-- Imported Math bank questions contain both SAT multiple-choice and grid-in
-- items. Keep both shapes editable without forcing one through the other UI.
update public.drills
set answer_types = array['mc_single', 'grid_in']::text[]
where slug = 'targeted-math';

update public.tests
set status = 'draft'
where slug in ('practice-test-3', 'practice-test-4', 'practice-test-5');

-- Existing rows retain their former availability; new content starts safely
-- as a draft until an admin explicitly publishes it.
alter table public.drills alter column status set default 'draft';
alter table public.tests alter column status set default 'draft';

-- Objective drill answers use one token for the question ledger, daily usage,
-- and XP award so browser retries remain idempotent end to end.
alter table public.drill_attempts
  add column if not exists client_token text;
create unique index if not exists drill_attempts_email_client_token_key
  on public.drill_attempts(email, client_token)
  where client_token is not null;

alter table public.drill_question_attempts
  add column if not exists session_token text;
create index if not exists drill_question_attempts_session_idx
  on public.drill_question_attempts(email, drill_slug, session_token, id)
  where source = 'drill' and session_token is not null;

-- The legacy mastery table predates the append-only attempt ledger. Preserve
-- those rows too; used questions must be unpublished rather than hard-deleted.
alter table public.drill_question_progress
  drop constraint if exists drill_question_progress_question_id_fkey,
  add constraint drill_question_progress_question_id_fkey
    foreign key (question_id) references public.drill_questions(id) on delete restrict;

-- One objective answer updates the append-only ledger and mutable mastery row
-- in the same transaction. The unique browser token makes a lost-response
-- retry a no-op instead of incrementing mastery twice.
create or replace function public.record_objective_drill_answer(
  p_email text,
  p_question_id text,
  p_drill_slug text,
  p_correct boolean,
  p_client_token text,
  p_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_attempt_id uuid;
begin
  if p_drill_slug not in ('targeted-math', 'vocab')
    or nullif(btrim(p_client_token), '') is null
    or nullif(btrim(p_session_token), '') is null then
    raise exception 'invalid objective drill answer';
  end if;
  if not exists (
    select 1
    from public.drill_questions q
    where q.id = p_question_id
      and q.drill_slug = p_drill_slug
      and q.status = 'published'
  ) then
    raise exception 'objective drill question not found';
  end if;

  insert into public.drill_question_attempts (
    email, question_id, drill_slug, source, correct, score, client_token, session_token
  ) values (
    p_email, p_question_id, p_drill_slug, 'drill', p_correct, null,
    p_client_token, p_session_token
  )
  on conflict (email, client_token) where client_token is not null do nothing
  returning id into inserted_attempt_id;

  if inserted_attempt_id is null then
    return false;
  end if;

  insert into public.drill_question_progress (
    email, question_id, drill_slug, attempts, best_score, mastered_at, last_seen_at
  ) values (
    p_email,
    p_question_id,
    p_drill_slug,
    1,
    case when p_drill_slug = 'vocab' and p_correct then 1
         when p_drill_slug = 'vocab' then 0
         else null end,
    case when p_drill_slug = 'targeted-math' and p_correct then now() else null end,
    now()
  )
  on conflict (email, question_id) do update set
    drill_slug = excluded.drill_slug,
    attempts = public.drill_question_progress.attempts + 1,
    best_score = case
      when p_drill_slug = 'vocab' and p_correct
        then least(3, coalesce(public.drill_question_progress.best_score, 0) + 1)
      when p_drill_slug = 'vocab' then 0
      else public.drill_question_progress.best_score
    end,
    mastered_at = coalesce(
      public.drill_question_progress.mastered_at,
      case
        when p_drill_slug = 'targeted-math' and p_correct then now()
        when p_drill_slug = 'vocab' and p_correct
          and coalesce(public.drill_question_progress.best_score, 0) + 1 >= 3 then now()
        else null
      end
    ),
    last_seen_at = now();

  return true;
end;
$$;

revoke all on function public.record_objective_drill_answer(text, text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.record_objective_drill_answer(text, text, text, boolean, text, text)
  to service_role;

create index if not exists drills_status_sort_idx on public.drills(status, sort);
create index if not exists tests_status_slug_idx on public.tests(status, slug);

-- Imported placeholders must leave student flow immediately. Admins can fix
-- the asset and explicitly republish the lesson afterward.
update public.course_lessons l
set status = 'draft'
where l.status = 'published'
  and (
    not exists (
      select 1 from public.course_lesson_blocks b where b.lesson_id = l.id
    )
    or exists (
      select 1
      from public.course_lesson_blocks b
      where b.lesson_id = l.id
        and (
          b.content ->> 'status' = 'unavailable'
          or (
            b.kind in ('video', 'file', 'image')
            and nullif(btrim(b.content ->> 'url'), '') is null
          )
          or (
            b.kind = 'text'
            and nullif(btrim(b.content ->> 'body'), '') is null
          )
          or (
            b.kind = 'practice'
            and case
              when jsonb_typeof(b.content -> 'practice' -> 'questions') = 'array'
                then jsonb_array_length(b.content -> 'practice' -> 'questions') = 0
              else true
            end
          )
        )
    )
  );

-- Student-facing reads only see published parent content. The service-role
-- client used by the admin CMS bypasses these policies for draft QA.
drop policy if exists "public read drills" on public.drills;
drop policy if exists "public read published drills" on public.drills;
create policy "public read published drills" on public.drills
  for select using (status = 'published');

drop policy if exists "public read pub questions" on public.drill_questions;
drop policy if exists "public read published drill questions" on public.drill_questions;
create policy "public read published drill questions" on public.drill_questions
  for select using (
    status = 'published'
    and exists (
      select 1
      from public.drills d
      where d.slug = drill_questions.drill_slug
        and d.status = 'published'
    )
  );

drop policy if exists "public read pub steps" on public.drill_walkthrough_steps;
drop policy if exists "public read published drill steps" on public.drill_walkthrough_steps;
create policy "public read published drill steps" on public.drill_walkthrough_steps
  for select using (
    exists (
      select 1
      from public.drill_questions q
      join public.drills d on d.slug = q.drill_slug
      where q.id = drill_walkthrough_steps.question_id
        and q.status = 'published'
        and d.status = 'published'
    )
  );

revoke select on public.drills from anon, authenticated;
grant select (slug, title, category, accent, uses_ai, ai_role, answer_types,
  scoring_config, status, sort, created_at, updated_at)
  on public.drills to anon, authenticated;

drop policy if exists "public read tests" on public.tests;
drop policy if exists "public read modules" on public.modules;
drop policy if exists "public read questions" on public.questions;
drop policy if exists "public read choices" on public.choices;
drop policy if exists "public read published tests" on public.tests;
drop policy if exists "public read published test modules" on public.modules;
drop policy if exists "public read published test questions" on public.questions;
drop policy if exists "public read published test choices" on public.choices;

create policy "public read published tests" on public.tests
  for select using (status = 'published');

create policy "public read published test modules" on public.modules
  for select using (
    exists (
      select 1 from public.tests t
      where t.id = modules.test_id and t.status = 'published'
    )
  );

create policy "public read published test questions" on public.questions
  for select using (
    exists (
      select 1
      from public.modules m
      join public.tests t on t.id = m.test_id
      where m.id = questions.module_id and t.status = 'published'
    )
  );

create policy "public read published test choices" on public.choices
  for select using (
    exists (
      select 1
      from public.questions q
      join public.modules m on m.id = q.module_id
      join public.tests t on t.id = m.test_id
      where q.id = choices.question_id and t.status = 'published'
    )
  );

-- Catalog membership is the only explicit Question Bank allowlist. Current
-- availability still requires an enabled catalog row and a published question;
-- historical attempts are deliberately aggregated independently.
-- Normalize the three pre-taxonomy Targeted Math seed shapes before strict
-- readiness checks take effect.
update public.drill_questions
set domain = 'Geometry and Trigonometry', skill = 'Circles'
where drill_slug = 'targeted-math'
  and (nullif(btrim(skill), '') is null or nullif(btrim(domain), '') is null)
  and lower(coalesce(stem, '') || ' ' || coalesce(passage, ''))
    ~ '(circle|circular|circumference|diameter|radius)';

update public.drill_questions
set skill = 'Nonlinear equations in one variable and systems of equations in two variables'
where drill_slug = 'targeted-math'
  and domain = 'Advanced Math'
  and nullif(btrim(skill), '') is null;

create or replace function public.question_bank_mc_content_is_ready(p_content jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_content -> 'choices') = 'array' then
      jsonb_array_length(p_content -> 'choices') = 4
      and p_content ->> 'correct' in ('A', 'B', 'C', 'D')
      and (
        select count(distinct choice ->> 'id') = 4
        from jsonb_array_elements(p_content -> 'choices') choice
        where choice ->> 'id' in ('A', 'B', 'C', 'D')
          and nullif(btrim(choice ->> 'text'), '') is not null
      )
    else false
  end;
$$;

create or replace function public.question_bank_grid_content_is_ready(p_content jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_content -> 'accepted') = 'array' then
      exists (
        select 1
        from jsonb_array_elements_text(p_content -> 'accepted') answer
        where nullif(btrim(answer), '') is not null
      )
    else false
  end;
$$;

create or replace function public.question_bank_question_is_runtime_ready(
  p_question public.drill_questions
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_question.status = 'published'
    and p_question.difficulty in ('easy', 'medium', 'hard')
    and nullif(btrim(p_question.skill), '') is not null
    and (
      (
        p_question.drill_slug = 'grammar'
        and p_question.section = 'rw'
        and p_question.answer_type = 'mc_single'
        and p_question.domain in (
          'Information and Ideas',
          'Craft and Structure',
          'Expression of Ideas',
          'Standard English Conventions'
        )
        and nullif(btrim(p_question.stem), '') is not null
        and nullif(btrim(p_question.passage), '') is not null
        and public.question_bank_mc_content_is_ready(p_question.content)
      )
      or (
        p_question.drill_slug = 'targeted-math'
        and p_question.section = 'math'
        and p_question.answer_type in ('mc_single', 'grid_in')
        and p_question.domain in (
          'Algebra',
          'Advanced Math',
          'Problem-Solving and Data Analysis',
          'Geometry and Trigonometry'
        )
        and coalesce(
          nullif(btrim(p_question.stem), ''),
          nullif(btrim(p_question.passage), '')
        ) is not null
        and case p_question.answer_type
          when 'mc_single' then public.question_bank_mc_content_is_ready(p_question.content)
          when 'grid_in' then public.question_bank_grid_content_is_ready(p_question.content)
          else false
        end
      )
    );
$$;

revoke all on function public.question_bank_mc_content_is_ready(jsonb) from public, anon, authenticated;
revoke all on function public.question_bank_grid_content_is_ready(jsonb) from public, anon, authenticated;
revoke all on function public.question_bank_question_is_runtime_ready(public.drill_questions) from public, anon, authenticated;

create or replace function public.get_question_bank_dashboard(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  subjects(section) as (
    values ('rw'::text), ('math'::text)
  ),
  difficulties(difficulty, sort) as (
    values ('easy'::text, 1), ('medium'::text, 2), ('hard'::text, 3)
  ),
  eligible as (
    select q.id, q.section, q.domain, q.skill, q.difficulty
    from public.question_bank_catalog c
    join public.drill_questions q on q.id = c.question_id
    where c.enabled = true
      and public.question_bank_question_is_runtime_ready(q)
  ),
  attempts as (
    select a.*
    from public.question_bank_attempts a
    where a.email = p_email
  ),
  subject_inventory as (
    select section, count(distinct id) as available
    from eligible
    group by section
  ),
  subject_attempts as (
    select
      section,
      count(distinct question_id) as solved,
      count(*) as attempts,
      count(*) filter (where correct) as correct
    from attempts
    group by section
  ),
  subject_stats as (
    select
      s.section,
      coalesce(i.available, 0) as available,
      coalesce(a.solved, 0) as solved,
      coalesce(a.attempts, 0) as attempts,
      coalesce(a.correct, 0) as correct
    from subjects s
    left join subject_inventory i on i.section = s.section
    left join subject_attempts a on a.section = s.section
  ),
  weeks as (
    select generate_series(
      date_trunc('week', timezone('utc', now()))::date - interval '11 weeks',
      date_trunc('week', timezone('utc', now()))::date,
      interval '1 week'
    )::date as week_start
  ),
  weekly as (
    select
      w.week_start,
      count(a.id) filter (where a.correct) as correct,
      count(a.id) filter (where not a.correct) as wrong,
      count(a.id) filter (where a.correct and a.difficulty = 'easy') as easy_correct,
      count(a.id) filter (where a.correct and a.difficulty = 'medium') as medium_correct,
      count(a.id) filter (where a.correct and a.difficulty = 'hard') as hard_correct,
      count(a.id) filter (where not a.correct and a.difficulty = 'easy') as easy_wrong,
      count(a.id) filter (where not a.correct and a.difficulty = 'medium') as medium_wrong,
      count(a.id) filter (where not a.correct and a.difficulty = 'hard') as hard_wrong
    from weeks w
    left join attempts a
      on date_trunc('week', timezone('utc', a.attempted_at))::date = w.week_start
    group by w.week_start
  ),
  topic_keys as (
    select section, coalesce(nullif(domain, ''), 'Other') as domain from eligible
    union
    select section, coalesce(nullif(domain, ''), 'Other') as domain from attempts
  ),
  topic_inventory as (
    select section, coalesce(nullif(domain, ''), 'Other') as domain, count(distinct id) as available
    from eligible
    group by section, coalesce(nullif(domain, ''), 'Other')
  ),
  topic_attempts as (
    select
      section,
      coalesce(nullif(domain, ''), 'Other') as domain,
      count(*) as attempts,
      count(*) filter (where correct) as correct
    from attempts
    group by section, coalesce(nullif(domain, ''), 'Other')
  ),
  topic_stats as (
    select
      k.section,
      k.domain,
      coalesce(i.available, 0) as available,
      coalesce(a.attempts, 0) as attempts,
      coalesce(a.correct, 0) as correct
    from topic_keys k
    left join topic_inventory i on i.section = k.section and i.domain = k.domain
    left join topic_attempts a on a.section = k.section and a.domain = k.domain
  ),
  difficulty_inventory as (
    select section, difficulty, count(distinct id) as available
    from eligible
    group by section, difficulty
  ),
  difficulty_attempts as (
    select
      section,
      difficulty,
      count(*) as attempts,
      count(*) filter (where correct) as correct,
      coalesce(round(avg(duration_ms)), 0) as average_duration_ms
    from attempts
    group by section, difficulty
  ),
  difficulty_stats as (
    select
      s.section,
      d.difficulty,
      d.sort,
      coalesce(i.available, 0) as available,
      coalesce(a.attempts, 0) as attempts,
      coalesce(a.correct, 0) as correct,
      coalesce(a.average_duration_ms, 0) as average_duration_ms
    from subjects s
    cross join difficulties d
    left join difficulty_inventory i
      on i.section = s.section and i.difficulty = d.difficulty
    left join difficulty_attempts a
      on a.section = s.section and a.difficulty = d.difficulty
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'attempted', (select count(*) from attempts),
      'correct', (select count(*) from attempts where correct),
      'accuracy', coalesce(
        (select round(100.0 * count(*) filter (where correct) / nullif(count(*), 0)) from attempts),
        0
      ),
      'saved', (
        select count(*)
        from public.question_bank_saves s
        join eligible e on e.id = s.question_id
        where s.email = p_email
      ),
      'streak', coalesce((select u.streak_current from public.users u where u.email = p_email), 0)
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'available', available,
        'solved', solved,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0)
      ) order by case section when 'rw' then 1 else 2 end)
      from subject_stats
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekStart', week_start,
        'correct', correct,
        'wrong', wrong,
        'easyCorrect', easy_correct,
        'mediumCorrect', medium_correct,
        'hardCorrect', hard_correct,
        'easyWrong', easy_wrong,
        'mediumWrong', medium_wrong,
        'hardWrong', hard_wrong
      ) order by week_start)
      from weekly
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'domain', domain,
        'available', available,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0)
      ) order by case section when 'rw' then 1 else 2 end, domain)
      from topic_stats
    ), '[]'::jsonb),
    'difficulty', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'difficulty', difficulty,
        'available', available,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0),
        'averageDurationMs', average_duration_ms
      ) order by case section when 'rw' then 1 else 2 end, sort)
      from difficulty_stats
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_question_bank_dashboard(text) from public, anon, authenticated;
grant execute on function public.get_question_bank_dashboard(text) to service_role;

comment on table public.question_bank_catalog is
  'Explicit allowlist of drill_questions eligible for Ultimate Question Bank; enabled published rows are current inventory.';
