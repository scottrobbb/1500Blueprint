-- drill_questions serves double duty: the same row can feed a standalone
-- practice drill (/drills/[slug]) AND, separately, the Question Bank via the
-- question_bank_catalog allowlist. Those two consumers previously shared one
-- gate (status = 'published'), so a question created purely for the Question
-- Bank automatically became live in its origin drill's standalone practice
-- pool too, with no way to keep it bank-only.
--
-- Adds an explicit visibility flag, defaulting to true so every existing
-- question keeps behaving exactly as it does today (nothing already live
-- disappears). New questions created from the Question Bank admin screen are
-- inserted with this set to false.

alter table public.drill_questions
  add column if not exists visible_in_drill boolean not null default true;

comment on column public.drill_questions.visible_in_drill is
  'False keeps a question out of its drill_slug''s standalone practice pool (/drills/[slug]) while still allowing Question Bank inclusion via question_bank_catalog. Defaults true for backward compatibility.';
