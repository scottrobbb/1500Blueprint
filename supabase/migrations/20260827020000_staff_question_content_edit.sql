-- Lets explanation editors fix LaTeX/formatting typos in a question's own
-- text (prompt, passage, choice wording) while writing its explanation.
-- Deliberately narrower than the admin question editor: no correct-answer,
-- difficulty, skill, status, or structural changes (choice ids/count/order
-- are fixed) are possible through this path, so a careless or malicious
-- edit here cannot corrupt grading, only wording.

create table if not exists public.question_content_edit_log (
  id text primary key default gen_random_uuid()::text,
  editor_email text not null,
  target_type text not null check (target_type in ('question_bank', 'practice_test')),
  target_id text not null,
  prior_content jsonb not null,
  next_content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists question_content_edit_log_target_idx
  on public.question_content_edit_log(target_type, target_id, created_at desc);
create index if not exists question_content_edit_log_editor_idx
  on public.question_content_edit_log(editor_email, created_at desc);

alter table public.question_content_edit_log enable row level security;
revoke all on table public.question_content_edit_log from public, anon, authenticated;
grant select, insert on table public.question_content_edit_log to service_role;

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
    select q.stem, q.passage, q.content, lower(q.difficulty) as difficulty,
      concat_ws(' ', coalesce(q.content #>> '{source,archivePath}', ''), coalesce(q.content #>> '{source,document}', '')) as source_label
    into cur
    from public.drill_questions q
    join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
    where q.id = p_target_id
    for update of q;

    if not found or cur.difficulty is null or cur.difficulty not in ('easy', 'medium', 'hard') or cur.source_label ~* 'challenge' then
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

revoke all on function public.update_staff_question_content(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_staff_question_content(text, text, text, text, text, jsonb)
  to service_role;

comment on table public.question_content_edit_log is
  'Append-only audit trail for explanation-editor fixes to a question''s own prompt/passage/choice text (never the correct answer or grading fields).';
comment on table public.staff_roles is
  'Scoped staff authorization. Explanation editors can update explanations and fix wording on the question itself (prompt/passage/choice text), but never the correct answer, difficulty, skill, status, or structure.';
