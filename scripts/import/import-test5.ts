/** Import the hybrid PV/TPB Test 5 source without replacing module/question IDs.
 * node --env-file=.env.local --import tsx scripts/import/import-test5.ts <docx> [--apply]
 * Defaults to a read-only audit. Writes remain draft until runtime verification.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { parseTest5Docx } from "./parse-test5";
import type { Test6Question } from "./parse-test6";

const source = process.argv[2];
if (!source) throw new Error("A Test 5 DOCX path is required");
const apply = process.argv.includes("--apply");
const project = "sobjtohszigzjcnoprdn";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (new URL(url).hostname !== `${project}.supabase.co`) throw new Error("Unexpected Supabase project");
const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const output = join(tmpdir(), `blueprint-test5-${hash(readFileSync(source)).slice(0, 12)}`);
mkdirSync(output, { recursive: true, mode: 0o700 });

type ChoiceRow = { id: string; question_id: string; letter: string; text: string; explanation: string | null };
type QuestionRow = {
  id: string; module_id: string; position: number; type: string; domain: string | null; skill: string | null;
  difficulty: string | null; passage: string | null; prompt: string; figure_url: string | null;
  correct: string | null; accepted_answers: string[]; explanation: string | null;
  explanation_source: string | null; needs_review: boolean; choices: ChoiceRow[];
};
type ModuleRow = { id: string; section: string; order: number; variant: string; minutes_per_module: number; questions: QuestionRow[] };
type Snapshot = { id: string; slug: string; title: string; status: string; updated_at: string; modules: ModuleRow[] };

const revisedMathExplanations: Record<string, string> = {
  "math/1/m1/9": "The vertical position starts at −1,000 meters and increases by 750 meters each minute. Its model is y = −1,000 + 750t, an increasing linear function.",
  "math/1/m1/17": "The zeros of f are 0, 2, and −8. Setting 5 − w equal to those values gives w = 5, 3, and 13, respectively. Their sum is 21.",
  "math/1/m1/20": "Congruence gives equal corresponding acute angles in the two right triangles. Triangle GCF therefore has equal base angles. Its angle at C is 180° − 40° = 140°, so each base angle is 20°. Angle EDC is complementary to the angle at G in right triangle EDG, giving 90° − 20° = 70°.",
  "math/2/easy/20": "From 0.48h = 0.98j and j = 0.95k, h/k = (0.98 × 0.95)/0.48 ≈ 1.93958. Thus h is approximately 193.958% of k, which rounds to 194%.",
  "math/2/hard/7": "Rearrange p/3 = 12 − 5q to get 5q = 12 − p/3 = (36 − p)/3. Dividing by 5 gives q = (36 − p)/15, choice B.",
  "math/2/hard/16": "Exactly one real solution requires a zero discriminant: 36² − 4(−3)(−z) = 0. Thus 1296 − 12z = 0, so z = 108. Since z = n + 4, n = 104.",
  "math/2/hard/17": "A cube has six square faces, so each face has area (c/12)² and side length c/12. The perimeter of one face is 4(c/12) = c/3, choice A.",
  "math/2/hard/20": "For the acute angles a and b, sin(a°) = cos(b°) means a + b = 90°. Since a = 1.4b, 2.4b = 90, giving b = 37.5°.",
  "math/2/hard/18": "If the smaller panel has area s², the larger has area 25s². At the same air speed, the larger panel carries 25/26 of the total airflow: 24,570 × 25/26 = 23,625 cubic meters per second.",
  "math/2/hard/19": "The base area is 15 × 10 = 150. The slant heights of the two pairs of triangular faces are √(22² + 5²) and √(22² + 7.5²). The total area is 150 + 15√509 + 10√540.25 ≈ 720.848 square units, or 720.8 to the nearest tenth.",
  "math/2/hard/22": "The radius ZX is √(2² + (√342)²) = √346. Both ZX and ZY are radii, and angle XZY is 90°, so XY² = 346 + 346 = 692. Therefore XY = √692, choice C.",
};

function normalize(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function mathExplanation(question: Test6Question, old: QuestionRow): string {
  const revised = revisedMathExplanations[question.key];
  if (revised) return revised;
  const oldText = normalize([old.passage, old.prompt].filter(Boolean).join(" ")).replace(/ Which choice answers the question\?$/, "");
  const newText = normalize([question.passage, question.prompt].filter(Boolean).join(" ")).replace(/ Which choice answers the question\?$/, "");
  const sameChoices = question.choices.length === old.choices.length && question.choices.every((choice) =>
    normalize(choice.text) === normalize(old.choices.find((item) => item.letter === choice.letter)?.text ?? null));
  if (oldText !== newText || !sameChoices || !old.explanation) throw new Error(`Review changed Math explanation: ${question.key}`);
  return old.explanation;
}

function sqlJson(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.includes("$test5$")) throw new Error("Unexpected SQL delimiter in content");
  return `$test5$${text}$test5$::jsonb`;
}

async function main() {
  const parsed = await parseTest5Docx(source);
  const { data: before, error } = await db.from("tests").select("*,modules(*,questions(*,choices(*)))")
    .eq("slug", "practice-test-5").single<Snapshot>();
  if (error) throw error;
  if (before.status !== "draft") throw new Error("Refusing to replace a published test");
  writeFileSync(join(output, `before-${Date.now()}.json`), JSON.stringify(before, null, 2), { mode: 0o600 });
  const uploaded = new Map<string, string>();
  for (const [name, image] of parsed.images) {
    const digest = hash(image.buffer);
    const object = `practice-test-5/${digest.slice(0, 24)}.${name.split(".").pop()}`;
    const publicUrl = db.storage.from("figures").getPublicUrl(object).data.publicUrl;
    if (apply) {
      const result = await db.storage.from("figures").upload(object, image.buffer, { contentType: image.contentType, upsert: true });
      if (result.error) throw result.error;
      const response = await fetch(publicUrl, { cache: "no-store" });
      if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== digest) throw new Error(`Figure verification failed: ${name}`);
    }
    uploaded.set(name, publicUrl);
  }
  const oldRows: Omit<QuestionRow, "choices">[] = [];
  const questions: Omit<QuestionRow, "choices">[] = [];
  const choices: Omit<ChoiceRow, "id">[] = [];
  for (const testModule of parsed.modules) {
    const stored = before.modules.find((item) => item.section === testModule.section && item.order === testModule.order && item.variant === (testModule.variant ?? "m1"));
    if (!stored || stored.questions.length !== testModule.questions.length || stored.minutes_per_module !== (testModule.section === "rw" ? 32 : 35)) {
      throw new Error(`Existing module does not match expected structure: ${testModule.label}`);
    }
    for (const q of testModule.questions) {
      const old = stored.questions.find((item) => item.position === q.position);
      if (!old) throw new Error(`Missing destination question: ${q.key}`);
      const { choices: oldChoices, ...oldRow } = old;
      oldRows.push(oldRow);
      const explanation = q.section === "rw" ? q.explanation : mathExplanation(q, old);
      let passage = q.passage;
      let prompt = q.prompt;
      if (q.key === "math/1/m1/17") passage = passage?.replace("The function g is defined by", "The function f is defined by") ?? null;
      if (q.key === "math/2/hard/19") prompt += " Round your answer to the nearest tenth.";
      questions.push({
        id: old.id, module_id: stored.id, position: q.position, type: q.type,
        domain: q.domain, skill: q.skill, difficulty: q.difficulty, passage, prompt,
        figure_url: q.figure ? uploaded.get(q.figure)! : null,
        correct: q.correct, accepted_answers: q.acceptedAnswers, explanation,
        explanation_source: q.section === "rw" ? "human" : revisedMathExplanations[q.key] ? "ai" : old.explanation_source,
        needs_review: false,
      });
      for (const choice of q.choices) choices.push({
        question_id: old.id, letter: choice.letter, text: choice.text,
        explanation: q.section === "rw" ? choice.explanation : revisedMathExplanations[q.key] ? null : oldChoices.find((item) => item.letter === choice.letter)?.explanation ?? null,
      });
    }
  }
  if (questions.length !== 147 || choices.length !== 492 || questions.filter((q) => q.figure_url).length !== 6
    || questions.filter((q) => q.passage?.includes("@@ROW@@")).length !== 4 || questions.some((q) => !q.explanation)) {
    throw new Error("Final import totals do not match the document");
  }
  const payload = { source: basename(source), sourceSha256: hash(readFileSync(source)), questions, choices };
  writeFileSync(join(output, "payload.json"), JSON.stringify(payload, null, 2), { mode: 0o600 });
  const sql = `begin;
select id from public.tests where id = '${before.id}' for update;
select q.id from public.questions q join public.modules m on m.id=q.module_id where m.test_id='${before.id}' for update of q;
select c.id from public.choices c join public.questions q on q.id=c.question_id join public.modules m on m.id=q.module_id where m.test_id='${before.id}' for update of c;
create temporary table test5_expected_choices on commit drop as select * from jsonb_populate_recordset(null::public.choices, ${sqlJson(before.modules.flatMap((item) => item.questions.flatMap((q) => q.choices)))});
create temporary table test5_expected on commit drop as select * from jsonb_populate_recordset(null::public.questions, ${sqlJson(oldRows)});
create temporary table test5_questions on commit drop as select * from jsonb_populate_recordset(null::public.questions, ${sqlJson(questions)});
create temporary table test5_choices on commit drop as select * from jsonb_populate_recordset(null::public.choices, ${sqlJson(choices)});
do $$ begin
 if exists (select 1 from test5_expected_choices e left join public.choices c on c.id=e.id where c.id is null or row(c.text,c.explanation) is distinct from row(e.text,e.explanation)) then raise exception 'Choices changed since backup'; end if;
 if (select status from public.tests where id='${before.id}') <> 'draft' then raise exception 'Test is no longer draft'; end if;
 if (select count(*) from test5_expected e join public.questions q on q.id=e.id) <> 147 then raise exception 'Question IDs changed'; end if;
 if exists (select 1 from test5_expected e join public.questions q on q.id=e.id where
   row(q.prompt,q.passage,q.correct,q.accepted_answers,q.explanation,q.figure_url) is distinct from
   row(e.prompt,e.passage,e.correct,e.accepted_answers,e.explanation,e.figure_url)) then raise exception 'Content changed since backup'; end if;
end $$;
update public.questions q set type=n.type,domain=n.domain,skill=n.skill,difficulty=n.difficulty,passage=n.passage,prompt=n.prompt,
 figure_url=n.figure_url,correct=n.correct,accepted_answers=n.accepted_answers,explanation=n.explanation,
 explanation_source=n.explanation_source,needs_review=n.needs_review from test5_questions n where q.id=n.id;
delete from public.choices c using test5_questions q where c.question_id=q.id and not exists
 (select 1 from test5_choices n where n.question_id=c.question_id and n.letter=c.letter);
insert into public.choices(question_id,letter,text,explanation) select question_id,letter,text,explanation from test5_choices
 on conflict(question_id,letter) do update set text=excluded.text,explanation=excluded.explanation;
update public.tests set title='Practice Test 5',source_file=${sqlJson(basename(source))} #>> '{}',updated_at=now() where id='${before.id}';
commit;
select 'Test 5 draft import committed' as result;`;
  const sqlFile = join(output, "import.sql");
  writeFileSync(sqlFile, sql, { mode: 0o600 });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", output, questions: questions.length, choices: choices.length, figures: 6, tables: 4, suppliedExplanations: 81 }));
  if (apply) {
    execFileSync("npx", ["--yes", "supabase", "db", "query", "--linked", "--project-ref", project, "--file", sqlFile], { stdio: "inherit" });
    const saved = await db.from("questions").select("*,choices(*)").in("module_id", before.modules.map((testModule) => testModule.id));
    if (saved.error) throw saved.error;
    const actual = saved.data as QuestionRow[];
    for (const expected of questions) {
      const row = actual.find((item) => item.id === expected.id);
      if (!row) throw new Error(`Missing saved question ${expected.id}`);
      for (const [field, value] of Object.entries(expected)) {
        if (JSON.stringify(row[field as keyof QuestionRow]) !== JSON.stringify(value)) throw new Error(`Saved mismatch: ${expected.id}.${field}`);
      }
      const expectedChoices = choices.filter((choice) => choice.question_id === row.id);
      if (row.choices.length !== expectedChoices.length) throw new Error(`Choice count mismatch: ${row.id}`);
      for (const expectedChoice of expectedChoices) {
        const savedChoice = row.choices.find((choice) => choice.letter === expectedChoice.letter);
        if (savedChoice?.text !== expectedChoice.text || savedChoice?.explanation !== expectedChoice.explanation) throw new Error(`Choice mismatch: ${row.id}`);
      }
    }
    console.log("Verified all 147 persisted questions and 492 choices. Test remains draft pending runtime verification.");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
