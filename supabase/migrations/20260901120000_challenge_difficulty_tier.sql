-- Challenge becomes a stored difficulty tier.
--
-- It used to be derived at read time: questionBankLevel() tagged a question as
-- Challenge when content.source named a Challenge archive, while the stored
-- difficulty stayed 'hard'. That made the tier unsettable from the admin
-- editor, because there was nothing to write. Challenge is now a real value in
-- drill_questions.difficulty.
--
-- Practice-test questions (public.questions) are deliberately untouched and stay
-- three-valued; only the drill/question-bank corpus gains the tier.

-- 1. Attempts record the question's stored difficulty, so the check constraint
--    has to admit the new value or grading a Challenge question raises.
alter table public.question_bank_attempts
  drop constraint if exists question_bank_attempts_difficulty_check;
alter table public.question_bank_attempts
  add constraint question_bank_attempts_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard', 'challenge'));

-- 2. Runtime readiness gates whether a question is servable at all. Without
--    'challenge' here every Challenge question would silently leave the bank
--    the moment its difficulty was written.
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
    and p_question.difficulty in ('easy', 'medium', 'hard', 'challenge')
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

-- 3. Backfill the questions the old read-time rule already treated as Challenge,
--    using exactly its predicate, so stored and derived agree from here on.
--    Idempotent: rows already at 'challenge' are skipped.
update public.drill_questions q
set difficulty = 'challenge',
    updated_at = now()
where q.difficulty is distinct from 'challenge'
  and concat_ws(
        ' ',
        coalesce(q.content #>> '{source,archivePath}', ''),
        coalesce(q.content #>> '{source,document}', '')
      ) ~* 'challenge';

-- 4. The dashboard's difficulty breakdown is driven by a fixed CTE of tiers.
--    Without 'challenge' a student's Challenge attempts are counted nowhere.
--    Copied verbatim from 20260830120000_question_bank_dashboard_free_tier.sql
--    with only that values list changed.
create or replace function public.get_question_bank_dashboard(
  p_email text,
  p_free_tier_only boolean default false
)
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
    values ('easy'::text, 1), ('medium'::text, 2), ('hard'::text, 3), ('challenge'::text, 4)
  ),
  eligible as (
    select q.id, q.section, q.domain, q.skill, q.difficulty
    from public.question_bank_catalog c
    join public.drill_questions q on q.id = c.question_id
    where c.enabled = true
      and (p_free_tier_only = false or c.access_tier = 'free')
      and q.status = 'published'
      and q.section in ('rw', 'math')
      and (
        (q.section = 'rw' and q.created_by = 'scott-reading-import')
        or (q.section = 'math' and q.created_by = 'scott-math-import')
      )
  ),
  attempts as (
    select a.*
    from public.question_bank_attempts a
    join eligible e on e.id = a.question_id
    where a.email = p_email
  ),
  subject_stats as (
    select
      s.section,
      count(distinct e.id) as available,
      count(distinct a.question_id) as solved,
      count(a.id) as attempts,
      count(a.id) filter (where a.correct) as correct
    from subjects s
    left join eligible e on e.section = s.section
    left join attempts a on a.question_id = e.id
    group by s.section
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
  topic_stats as (
    select
      e.section,
      coalesce(nullif(e.domain, ''), 'Other') as domain,
      count(distinct e.id) as available,
      count(a.id) filter (
        where a.section = e.section
          and coalesce(nullif(a.domain, ''), 'Other') = coalesce(nullif(e.domain, ''), 'Other')
      ) as attempts,
      count(a.id) filter (
        where a.correct
          and a.section = e.section
          and coalesce(nullif(a.domain, ''), 'Other') = coalesce(nullif(e.domain, ''), 'Other')
      ) as correct
    from eligible e
    left join attempts a on a.question_id = e.id
    group by e.section, coalesce(nullif(e.domain, ''), 'Other')
  ),
  difficulty_stats as (
    select
      s.section,
      d.difficulty,
      d.sort,
      count(distinct e.id) as available,
      count(a.id) filter (where a.section = s.section and a.difficulty = d.difficulty) as attempts,
      count(a.id) filter (where a.correct and a.section = s.section and a.difficulty = d.difficulty) as correct,
      coalesce(round(avg(a.duration_ms) filter (
        where a.section = s.section and a.difficulty = d.difficulty
      )), 0) as average_duration_ms
    from subjects s
    cross join difficulties d
    left join eligible e on e.section = s.section and e.difficulty = d.difficulty
    left join attempts a on a.question_id = e.id
    group by s.section, d.difficulty, d.sort
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
