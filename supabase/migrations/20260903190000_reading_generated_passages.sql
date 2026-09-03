-- The Reading Comprehension Drill no longer serves authored passages. Every run
-- generates a fresh passage with Claude, so each one needs somewhere to live for
-- the length of a single attempt.
--
-- The row exists mainly to keep the grading key server-side: the student's
-- browser receives `body` (it has to — they read it) but never core_points or
-- depth_points, and grading looks those up here by id + email rather than
-- trusting anything posted back. graded_at makes a passage single-use, so a
-- replayed submission cannot pad the three-in-a-row streak.
--
-- Server-only: read/written with the secret (service-role) key. RLS on with no
-- policies, matching the lockdown in drill_progress.sql.

create table if not exists public.reading_generated_passages (
  id           text primary key default gen_random_uuid()::text,
  email        text not null references public.users(email) on delete cascade,
  level        integer not null,
  difficulty   text not null,                 -- 'medium' | 'hard' | 'extreme'
  read_seconds integer not null,
  topic        text,                          -- short subject label, used to avoid repeats
  body         jsonb not null default '[]'::jsonb, -- string[] of paragraphs
  core_points  jsonb not null default '[]'::jsonb, -- [{label,text}] main idea + resolution
  depth_points jsonb not null default '[]'::jsonb, -- [{label,text}] supporting layer
  graded_at    timestamptz,                   -- set once, when the recall is graded
  created_at   timestamptz not null default now(),
  constraint reading_generated_passages_level_check check (level between 1 and 8),
  constraint reading_generated_passages_difficulty_check check (
    difficulty in ('medium', 'hard', 'extreme')
  ),
  constraint reading_generated_passages_read_seconds_check check (
    read_seconds between 1 and 600
  )
);

-- Recent-topic lookup for one student (steers the generator off repeats).
create index if not exists reading_generated_passages_email_created_idx
  on public.reading_generated_passages(email, created_at desc);

alter table public.reading_generated_passages enable row level security;
revoke all on table public.reading_generated_passages from anon, authenticated;

-- The reading grader now checks two weighted tiers of points instead of one flat
-- key-point list, so the seeded prompt is replaced. The strict-JSON contract is
-- appended by the route, not stored here, so editing this text in the CMS can
-- never break parsing.
update public.drills
set grading_prompt = 'You are grading a student''s from-memory recall summary of an SAT reading passage they can no longer see. You are given the passage and two tiers of checkable points: CORE points (the main idea, the finding, and the time frame — what the passage is actually about) and DEPTH points (mechanism, consequences, significance — the supporting layer). For each point decide whether the summary recalls it fully, partially, or not at all. Judge meaning, never wording: a correct paraphrase is full recall, and a student never has to reproduce the passage''s phrasing, names, or exact numbers to earn a point unless the point itself is about that number. Mark ''partial'' when the summary gestures at the idea but leaves out the part that makes it specific — a claim without its direction, a change without its period, a finding without what it was about. Ignore surface detail the points do not ask for. Do not reward or punish a student for remembering names of people, institutions, or places, or any other detail that is not part of the main idea and resolution. Separately, list any claim the summary makes that the passage does not support. Only list clear contradictions or invented facts, never a vague or compressed restatement. Write one direct sentence of verdict addressed to the student.',
    updated_at = now()
where slug = 'reading';

-- scoring_config is a reference display in the CMS. Its readSeconds is now set
-- per level by the ladder, so replace it with the ladder's own numbers.
update public.drills
set scoring_config = (scoring_config - 'readSeconds')
  || '{"streakTarget":3,"xpReward":60,"maxLevel":8,"passScore":85,"maxLevelPassScore":95}'::jsonb,
    updated_at = now()
where slug = 'reading';
