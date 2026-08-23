-- 1500 Blueprint — drill CMS seed data.
-- Run AFTER supabase/drills.sql. Idempotent: upserts on natural keys.
-- Paste into Supabase -> SQL Editor -> New query -> Run.

-- ---------------------------------------------------------------------------
-- sat_skills: full 29-skill canonical taxonomy (College Board Digital SAT).
-- Names verbatim from the official Assessment Framework / Test Spec Overview.
-- ---------------------------------------------------------------------------
insert into public.sat_skills (section, domain, name, sort) values
  -- R&W . Information and Ideas
  ('rw','Information and Ideas','Central Ideas and Details',1),
  ('rw','Information and Ideas','Inferences',2),
  ('rw','Information and Ideas','Command of Evidence',3),
  -- R&W . Craft and Structure
  ('rw','Craft and Structure','Words in Context',1),
  ('rw','Craft and Structure','Text Structure and Purpose',2),
  ('rw','Craft and Structure','Cross-Text Connections',3),
  -- R&W . Expression of Ideas
  ('rw','Expression of Ideas','Rhetorical Synthesis',1),
  ('rw','Expression of Ideas','Transitions',2),
  -- R&W . Standard English Conventions
  ('rw','Standard English Conventions','Boundaries',1),
  ('rw','Standard English Conventions','Form, Structure, and Sense',2),
  -- Math . Algebra
  ('math','Algebra','Linear equations in one variable',1),
  ('math','Algebra','Linear equations in two variables',2),
  ('math','Algebra','Linear functions',3),
  ('math','Algebra','Systems of two linear equations in two variables',4),
  ('math','Algebra','Linear inequalities in one or two variables',5),
  -- Math . Advanced Math
  ('math','Advanced Math','Equivalent expressions',1),
  ('math','Advanced Math','Nonlinear equations in one variable and systems of equations in two variables',2),
  ('math','Advanced Math','Nonlinear functions',3),
  -- Math . Problem-Solving and Data Analysis
  ('math','Problem-Solving and Data Analysis','Ratios, rates, proportional relationships, and units',1),
  ('math','Problem-Solving and Data Analysis','Percentages',2),
  ('math','Problem-Solving and Data Analysis','One-variable data: distributions and measures of center and spread',3),
  ('math','Problem-Solving and Data Analysis','Two-variable data: models and scatterplots',4),
  ('math','Problem-Solving and Data Analysis','Probability and conditional probability',5),
  ('math','Problem-Solving and Data Analysis','Inference from sample statistics and margin of error',6),
  ('math','Problem-Solving and Data Analysis','Evaluating statistical claims: observational studies and experiments',7),
  -- Math . Geometry and Trigonometry
  ('math','Geometry and Trigonometry','Area and volume',1),
  ('math','Geometry and Trigonometry','Lines, angles, and triangles',2),
  ('math','Geometry and Trigonometry','Right triangles and trigonometry',3),
  ('math','Geometry and Trigonometry','Circles',4)
on conflict (section, domain, name) do update set sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- drills: the 7 drill types with default grading prompts + scoring config.
-- AI drills get a real grading_prompt; offline drills get null prompt.
-- NOTE: on conflict, grading_prompt and scoring_config are PRESERVED so admin
-- edits in the CMS are never clobbered by a re-run of this seed.
-- ---------------------------------------------------------------------------
insert into public.drills (slug, title, category, accent, uses_ai, ai_role, answer_types, grading_prompt, scoring_config, sort) values
  (
    'grammar','Grammar Drill','Writing','brand', true,'grade-process',
    array['mc_single'],
    'You are grading a student''s EXPLANATION of how they solved an SAT Standard English Conventions question — not their answer choice. The correct answer and the critical-path Walkthrough steps are provided. Award up to 100 points based on how completely the explanation works the critical path in order. Each Walkthrough step is worth an equal share. CONFIRM_OPTION steps require the student to explicitly verify the chosen option against the rule. Return strict JSON: {"score": 0-100, "verdict": "<one line>", "feedback": "<prose>", "stepsMissed": ["<step text>", ...]}. A perfect run lists no missed steps. Do not reward merely naming the right letter without the reasoning.',
    '{"mastery":{"streakTarget":2,"totalPatterns":25},"xpReward":50,"passScore":100}'::jsonb,
    1
  ),
  (
    'reading','Reading Comprehension','Reading','navy', true,'grade-summary',
    array['free_text'],
    'You are grading a student''s from-memory recall SUMMARY of an SAT reading passage. The canonical key points (in order) are provided. Award up to 100 points for how many key points the summary captures, weighting central ideas over minor details. Penalize fabricated claims not supported by the passage. Return strict JSON: {"score": 0-100, "verdict": "<one line>", "captured": [{"text":"<key point>","captured":true|false}, ...]}. Mark each provided key point captured or not.',
    '{"readSeconds":118,"streakTarget":3,"xpReward":60}'::jsonb,
    2
  ),
  (
    'word-scan','Word Scan Drill','Reading','sky', false,'none',
    array['multi_select'],
    null,
    '{"secondsPerQuestion":5,"totalQuestions":10,"singleFailureEnds":true}'::jsonb,
    3
  ),
  (
    'targeted-math','Targeted Math Practice','Math','gold', false,'none',
    array['mc_single','grid_in'],
    null,
    '{"lives":2,"winTarget":10,"secondsPerQuestion":90,"showReference":true}'::jsonb,
    4
  ),
  (
    'ai-math','AI Math Practice','Math','brand', true,'generate',
    array['mc_single','grid_in'],
    'You generate one SAT-style math question at the requested domain/difficulty. Return strict JSON: for multiple choice {"kind":"mc","prompt":"...","choices":[{"id":"A","text":"..."},...4],"correct":"A|B|C|D","explanation":"..."}; for grid-in {"kind":"grid","prompt":"...","accepted":["<normalized answers>"],"explanation":"..."}. Use $...$ for inline LaTeX. Keep one unambiguous correct answer.',
    '{"defaultDifficulty":"medium"}'::jsonb,
    5
  ),
  (
    'vocab','Vocab Drill','Vocabulary','gold', false,'none',
    array['mc_single'],
    null,
    '{"autoAdvanceMs":850,"timed":true}'::jsonb,
    6
  ),
  (
    'flashcards','Vocab Flashcards','Vocabulary','sky', false,'none',
    array['spaced_repetition'],
    null,
    '{"ratings":["again","good","easy"]}'::jsonb,
    7
  )
on conflict (slug) do update set
  title          = excluded.title,
  category       = excluded.category,
  accent         = excluded.accent,
  uses_ai        = excluded.uses_ai,
  ai_role        = excluded.ai_role,
  answer_types   = excluded.answer_types,
  grading_prompt = coalesce(public.drills.grading_prompt, excluded.grading_prompt), -- keep edited prompt
  sort           = excluded.sort;
-- scoring_config intentionally NOT overwritten on conflict so admin edits persist.
