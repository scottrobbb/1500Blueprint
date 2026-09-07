-- Challenge is admitted to the staff explanation queue for Math only.
--
-- 20260907120000 admitted the whole Challenge tier. Scott wants only the Math
-- half worked right now, so this narrows it: Challenge Math is eligible,
-- Challenge Reading & Writing is not. Applying this file produces that end
-- state whether or not the earlier migration was ever run.
--
-- The rule now lives in one predicate rather than being spelled out in five
-- places. Five functions gate on it -- the queue, its badge count, both write
-- boundaries, and the editor credit stats -- and they have to agree, or an
-- editor sees a question they are then refused permission to save. Admitting
-- Reading & Writing later is a one-line change to the predicate instead of
-- five separate edits that must be kept identical.
--
-- Practice-test questions (public.questions) are untouched: they were
-- deliberately left three-valued when the tier landed and never carry
-- Challenge, so their branch keeps its own literal list.
--
-- Each function below is otherwise copied verbatim from 20260907120000.
-- Signatures are unchanged, so CREATE OR REPLACE keeps existing privileges;
-- the grants are restated at the end so this file stands on its own.

-- The one place the policy lives.
create or replace function public.staff_explanation_eligible(
  p_difficulty text,
  p_section text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_difficulty, ''))
    when 'easy' then true
    when 'medium' then true
    when 'hard' then true
    -- Challenge is Math-only for now. drill_questions.section is nullable and
    -- reads as Reading & Writing when absent -- the queue coalesces it exactly
    -- that way -- so a null section is deliberately not Math.
    when 'challenge' then lower(coalesce(p_section, 'rw')) = 'math'
    else false
  end;
$$;

-- get_explanation_queue: gates on the shared predicate.
create or replace function public.get_explanation_queue(p_limit integer default 500)
returns table (
  id text, target_type text, source_label text, location text, section text,
  difficulty text, skill text, passage text, prompt text, figure_url text,
  choices jsonb, correct_answer text, explanation text, published boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with bank_candidates as (
    select
      q.id,
      'question_bank'::text as target_type,
      case when q.section = 'math' then 'Question Bank · Math' else 'Question Bank · Reading & Writing' end as source_label,
      coalesce(nullif(concat_ws(' · ', nullif(q.domain, ''), nullif(q.skill, '')), ''), q.drill_slug) as location,
      coalesce(q.section, 'rw') as section,
      lower(q.difficulty) as difficulty,
      q.skill,
      q.passage,
      coalesce(nullif(trim(q.stem), ''), nullif(trim(q.passage), ''), 'Untitled question') as prompt,
      q.figure_url,
      coalesce(q.content -> 'choices', '[]'::jsonb) as choices,
      case
        when q.answer_type = 'grid_in' then coalesce(array_to_string(array(
          select jsonb_array_elements_text(coalesce(q.content -> 'accepted', '[]'::jsonb))
        ), ' or '), '')
        else coalesce((
          select (choice ->> 'id') || '. ' || (choice ->> 'text')
          from jsonb_array_elements(coalesce(q.content -> 'choices', '[]'::jsonb)) choice
          where choice ->> 'id' = q.content ->> 'correct'
          limit 1
        ), '')
      end as correct_answer,
      coalesce(q.explanation, '') as explanation,
      q.status = 'published' as published
    from public.question_bank_catalog catalog
    join public.drill_questions q on q.id = catalog.question_id
    where catalog.enabled = true
      and public.staff_explanation_eligible(q.difficulty, q.section)
      and nullif(trim(q.explanation), '') is null
  ),
  test_candidates as (
    select
      q.id,
      'practice_test'::text as target_type,
      t.title as source_label,
      (case when m.section = 'math' then 'Math' else 'R&W' end)
        || ' M' || m."order"::text
        || case when m."order" = 2 then ' ' || initcap(m.variant) else '' end
        || ' · Question ' || q.position::text as location,
      m.section,
      lower(q.difficulty) as difficulty,
      q.skill,
      q.passage,
      q.prompt,
      q.figure_url,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.letter, 'text', c.text) order by c.letter)
        from public.choices c
        where c.question_id = q.id
      ), '[]'::jsonb) as choices,
      case
        when q.type = 'grid' then coalesce(array_to_string(q.accepted_answers, ' or '), '')
        else coalesce((
          select c.letter || '. ' || c.text
          from public.choices c
          where c.question_id = q.id and c.letter = q.correct
          limit 1
        ), '')
      end as correct_answer,
      coalesce(q.explanation, '') as explanation,
      t.status = 'published' as published
    from public.questions q
    join public.modules m on m.id = q.module_id
    join public.tests t on t.id = m.test_id
    where lower(q.difficulty) in ('easy', 'medium', 'hard')
      and nullif(trim(q.explanation), '') is null
  ),
  ranked as (
    select candidates.*,
      row_number() over (
        partition by target_type
        order by source_label, location, id
      ) as source_rank
    from (
      select * from bank_candidates
      union all
      select * from test_candidates
    ) candidates
  )
  select
    id, target_type, source_label, location, section, difficulty, skill,
    passage, prompt, figure_url, choices, correct_answer, explanation, published
  from ranked
  order by source_rank, target_type, source_label, location
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;

-- get_explanation_queue_count: gates on the shared predicate.
create or replace function public.get_explanation_queue_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select (
    select count(*)
    from public.question_bank_catalog c
    join public.drill_questions q on q.id = c.question_id
    where c.enabled = true
      and public.staff_explanation_eligible(q.difficulty, q.section)
      and nullif(trim(q.explanation), '') is null
  ) + (
    select count(*)
    from public.questions q
    where lower(q.difficulty) in ('easy', 'medium', 'hard')
      and nullif(trim(q.explanation), '') is null
  );
$$;

-- update_staff_explanation: gates on the shared predicate.
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
  target_difficulty text;
  target_section text;
  target_source text;
  clean_explanation text := trim(coalesce(p_explanation, ''));
begin
  if cardinality(regexp_split_to_array(clean_explanation, E'\\s+')) < 15 then
    raise exception 'Explanation must contain at least 15 words';
  end if;
  if char_length(clean_explanation) > 20000 then
    raise exception 'Explanation is too long';
  end if;

  if p_target_type = 'question_bank' then
    select
      q.explanation,
      lower(q.difficulty),
      q.section,
      concat_ws(
        ' ',
        coalesce(q.content #>> '{source,archivePath}', ''),
        coalesce(q.content #>> '{source,document}', '')
      )
    into prior_value, target_difficulty, target_section, target_source
    from public.drill_questions q
    join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
    where q.id = p_target_id
    for update of q;

    if not found
      or target_difficulty is null
      or not public.staff_explanation_eligible(target_difficulty, target_section)
    then
      raise exception 'Question is not eligible for staff explanation';
    end if;
    if nullif(trim(prior_value), '') is not null then
      raise exception 'Question already has an explanation';
    end if;

    update public.drill_questions
    set explanation = clean_explanation, updated_at = now()
    where id = p_target_id;
  elsif p_target_type = 'practice_test' then
    select q.explanation, lower(q.difficulty)
    into prior_value, target_difficulty
    from public.questions q
    where q.id = p_target_id
    for update;

    if not found or target_difficulty is null or target_difficulty not in ('easy', 'medium', 'hard') then
      raise exception 'Question is not eligible for staff explanation';
    end if;
    if nullif(trim(prior_value), '') is not null then
      raise exception 'Question already has an explanation';
    end if;

    update public.questions
    set explanation = clean_explanation, explanation_source = 'human'
    where id = p_target_id;
  else
    raise exception 'Unsupported explanation target';
  end if;

  insert into public.explanation_edit_log (
    editor_email, target_type, target_id, prior_explanation, next_explanation
  ) values (
    lower(trim(p_editor_email)), p_target_type, p_target_id, prior_value, clean_explanation
  );
end;
$$;

-- update_staff_question_content: gates on the shared predicate.
create or replace function public.update_staff_question_content(
  p_editor_email text,
  p_target_type text,
  p_target_id text,
  p_prompt text,    -- null = leave unchanged
  p_passage text,   -- null = leave unchanged; '' clears it
  p_choices jsonb   -- null = leave unchanged; else [{id, text}, ...] covering every existing choice
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur record;
  v_prior jsonb;
  v_next jsonb;
  existing_ids text[];
  incoming_ids text[];
  choice_row jsonb;
begin
  if p_prompt is null and p_passage is null and p_choices is null then
    raise exception 'Nothing to update';
  end if;
  if p_prompt is not null and trim(p_prompt) = '' then
    raise exception 'The question prompt cannot be blank';
  end if;
  if p_prompt is not null and char_length(p_prompt) > 20000 then
    raise exception 'The prompt is too long';
  end if;
  if p_passage is not null and char_length(p_passage) > 50000 then
    raise exception 'The passage is too long';
  end if;

  if p_target_type = 'question_bank' then
    select q.stem, q.passage, q.content, lower(q.difficulty) as difficulty, q.section,
      concat_ws(' ', coalesce(q.content #>> '{source,archivePath}', ''), coalesce(q.content #>> '{source,document}', '')) as source_label
    into cur
    from public.drill_questions q
    join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
    where q.id = p_target_id
    for update of q;

    if not found or cur.difficulty is null or not public.staff_explanation_eligible(cur.difficulty, cur.section) then
      raise exception 'Question is not eligible for staff editing';
    end if;

    existing_ids := array(select jsonb_array_elements(coalesce(cur.content -> 'choices', '[]'::jsonb)) ->> 'id');
    v_prior := jsonb_build_object('stem', cur.stem, 'passage', cur.passage, 'choices', coalesce(cur.content -> 'choices', '[]'::jsonb));

    if p_choices is not null then
      incoming_ids := array(select jsonb_array_elements(p_choices) ->> 'id');
      if (select array_agg(x order by x) from unnest(existing_ids) x) is distinct from (select array_agg(x order by x) from unnest(incoming_ids) x) then
        raise exception 'Choice ids must match the existing choices exactly';
      end if;
      for choice_row in select jsonb_array_elements(p_choices) loop
        if coalesce(trim(choice_row ->> 'text'), '') = '' then raise exception 'Choice text cannot be blank'; end if;
        if char_length(choice_row ->> 'text') > 5000 then raise exception 'A choice is too long'; end if;
      end loop;
    end if;

    update public.drill_questions
    set
      stem = coalesce(p_prompt, stem),
      passage = case when p_passage is null then passage else nullif(p_passage, '') end,
      content = case when p_choices is not null then jsonb_set(content, '{choices}', p_choices) else content end,
      updated_at = now()
    where id = p_target_id;

    v_next := jsonb_build_object(
      'stem', coalesce(p_prompt, cur.stem),
      'passage', case when p_passage is null then cur.passage else nullif(p_passage, '') end,
      'choices', coalesce(p_choices, cur.content -> 'choices', '[]'::jsonb)
    );

  elsif p_target_type = 'practice_test' then
    select q.prompt, q.passage, lower(q.difficulty) as difficulty
    into cur
    from public.questions q
    where q.id = p_target_id
    for update;

    if not found or cur.difficulty is null or cur.difficulty not in ('easy', 'medium', 'hard') then
      raise exception 'Question is not eligible for staff editing';
    end if;

    existing_ids := array(select letter from public.choices where question_id = p_target_id order by letter);
    v_prior := jsonb_build_object(
      'prompt', cur.prompt, 'passage', cur.passage,
      'choices', coalesce((select jsonb_agg(jsonb_build_object('id', letter, 'text', text) order by letter) from public.choices where question_id = p_target_id), '[]'::jsonb)
    );

    if p_choices is not null then
      incoming_ids := array(select jsonb_array_elements(p_choices) ->> 'id');
      if (select array_agg(x order by x) from unnest(existing_ids) x) is distinct from (select array_agg(x order by x) from unnest(incoming_ids) x) then
        raise exception 'Choice ids must match the existing choices exactly';
      end if;
      for choice_row in select jsonb_array_elements(p_choices) loop
        if coalesce(trim(choice_row ->> 'text'), '') = '' then raise exception 'Choice text cannot be blank'; end if;
        if char_length(choice_row ->> 'text') > 5000 then raise exception 'A choice is too long'; end if;
      end loop;
      for choice_row in select jsonb_array_elements(p_choices) loop
        update public.choices set text = choice_row ->> 'text'
        where question_id = p_target_id and letter = choice_row ->> 'id';
      end loop;
    end if;

    update public.questions
    set
      prompt = coalesce(p_prompt, prompt),
      passage = case when p_passage is null then passage else nullif(p_passage, '') end
    where id = p_target_id;

    v_next := jsonb_build_object(
      'prompt', coalesce(p_prompt, cur.prompt),
      'passage', case when p_passage is null then cur.passage else nullif(p_passage, '') end,
      'choices', coalesce(p_choices, v_prior -> 'choices')
    );

  else
    raise exception 'Unsupported question target';
  end if;

  insert into public.question_content_edit_log (
    editor_email, target_type, target_id, prior_content, next_content
  ) values (
    lower(trim(p_editor_email)), p_target_type, p_target_id, v_prior, v_next
  );
end;
$$;

-- get_explanation_editor_stats: gates on the shared predicate.
create or replace function public.get_explanation_editor_stats()
returns table (
  editor_email text,
  editor_name text,
  completed_total bigint,
  completed_last_7_days bigint,
  completed_today bigint,
  last_completed_at timestamptz,
  current_staff boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with qualifying_edits as (
    select l.*
    from public.explanation_edit_log l
    where nullif(trim(l.prior_explanation), '') is null
      and cardinality(regexp_split_to_array(trim(l.next_explanation), E'\\s+')) >= 15
      and (
        (
          l.target_type = 'question_bank'
          and exists (
            select 1
            from public.drill_questions q
            join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
            where q.id = l.target_id
              and public.staff_explanation_eligible(q.difficulty, q.section)
          )
        )
        or (
          l.target_type = 'practice_test'
          and exists (
            select 1
            from public.questions q
            where q.id = l.target_id
              and lower(q.difficulty) in ('easy', 'medium', 'hard')
          )
        )
      )
  ),
  credited as (
    select distinct on (target_type, target_id)
      editor_email, target_type, target_id, created_at
    from qualifying_edits
    order by target_type, target_id, created_at, id
  ),
  editors as (
    select email
    from public.staff_roles
    where role = 'explanation_editor'
    union
    select editor_email
    from credited
  )
  select
    editors.email as editor_email,
    users.name as editor_name,
    count(credited.target_id) as completed_total,
    count(credited.target_id) filter (
      where credited.created_at >= now() - interval '7 days'
    ) as completed_last_7_days,
    count(credited.target_id) filter (
      where credited.created_at >= (
        date_trunc('day', now() at time zone 'America/New_York')
        at time zone 'America/New_York'
      )
    ) as completed_today,
    max(credited.created_at) as last_completed_at,
    exists (
      select 1
      from public.staff_roles roles
      where roles.email = editors.email and roles.role = 'explanation_editor'
    ) as current_staff
  from editors
  left join public.users users on users.email = editors.email
  left join credited on credited.editor_email = editors.email
  group by editors.email, users.name
  order by completed_total desc, editors.email;
$$;

-- Restated rather than assumed. Every one of these accepts an identity or
-- performs a mutation, and public-schema defaults revoke execute from
-- public/anon/authenticated, so the service-role grant is the only way in.
revoke all on function public.staff_explanation_eligible(text, text) from public, anon, authenticated;
revoke all on function public.get_explanation_queue(integer) from public, anon, authenticated;
revoke all on function public.get_explanation_queue_count() from public, anon, authenticated;
revoke all on function public.update_staff_explanation(text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_staff_question_content(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_explanation_editor_stats() from public, anon, authenticated;

grant execute on function public.staff_explanation_eligible(text, text) to service_role;
grant execute on function public.get_explanation_queue(integer) to service_role;
grant execute on function public.get_explanation_queue_count() to service_role;
grant execute on function public.update_staff_explanation(text, text, text, text) to service_role;
grant execute on function public.update_staff_question_content(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.get_explanation_editor_stats() to service_role;
