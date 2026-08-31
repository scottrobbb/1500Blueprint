/**
 * Restore the line break inside stacked answer choices.
 *
 * parseChoices in scripts/import/parse.ts used to join a multi-line choice's
 * rows with a space, so systems-of-equations choices were stored with both
 * equations flattened onto one line. The importer now keeps the newline; this
 * repairs the rows imported before that fix.
 *
 * Review first (default -- reads only, writes nothing):
 *   npx tsx --env-file=.env.local scripts/fix-choice-line-breaks.ts
 *
 * Apply after reading the diff:
 *   npx tsx --env-file=.env.local scripts/fix-choice-line-breaks.ts --write
 *
 * Limited to Question Bank questions unless --all-questions is passed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { splitStackedEquations } from "../lib/sat/choiceLines";

type QuestionRow = { id: string; content: Record<string, unknown> | null };
type Choice = { id: string; text: string };
type Repair = { questionId: string; before: string; after: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readChoices(content: Record<string, unknown> | null): Choice[] | null {
  const source = content?.choices;
  if (!Array.isArray(source)) return null;
  const choices = source.filter((item): item is Choice => (
    isRecord(item) && typeof item.id === "string" && typeof item.text === "string"
  ));
  return choices.length === source.length ? choices : null;
}

async function loadCatalogIds(db: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("question_bank_catalog")
      .select("question_id")
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not read question_bank_catalog: ${error.message}`);
    const page = (data ?? []) as { question_id: string }[];
    for (const row of page) ids.add(row.question_id);
    if (page.length < 1000) return ids;
  }
}

async function loadQuestions(db: SupabaseClient): Promise<QuestionRow[]> {
  const rows: QuestionRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("drill_questions")
      .select("id,content")
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not read drill_questions: ${error.message}`);
    const page = (data ?? []) as QuestionRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function main() {
  const write = process.argv.includes("--write");
  const allQuestions = process.argv.includes("--all-questions");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }
  const db = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

  const scope = allQuestions ? null : await loadCatalogIds(db);
  const questions = await loadQuestions(db);

  const repairs: Repair[] = [];
  const updates: { id: string; content: Record<string, unknown> }[] = [];

  for (const question of questions) {
    if (scope && !scope.has(question.id)) continue;
    const choices = readChoices(question.content);
    if (!choices || !question.content) continue;

    let changed = false;
    const next = choices.map((choice) => {
      const text = splitStackedEquations(choice.text);
      if (text === choice.text) return choice;
      changed = true;
      repairs.push({ questionId: question.id, before: choice.text, after: text });
      return { ...choice, text };
    });
    if (changed) updates.push({ id: question.id, content: { ...question.content, choices: next } });
  }

  console.log(`Scanned ${questions.length} questions${scope ? ` (${scope.size} in the Question Bank)` : ""}.`);
  console.log(`${updates.length} questions have ${repairs.length} stacked choices to repair.\n`);
  for (const repair of repairs.slice(0, 40)) {
    console.log(`  ${repair.questionId}`);
    console.log(`    before: ${JSON.stringify(repair.before)}`);
    console.log(`    after:  ${JSON.stringify(repair.after)}`);
  }
  if (repairs.length > 40) console.log(`  … and ${repairs.length - 40} more.`);

  if (!write) {
    console.log("\n[dry-run] Nothing was written. Re-run with --write to apply.");
    return;
  }

  let written = 0;
  for (const update of updates) {
    const { error } = await db
      .from("drill_questions")
      .update({ content: update.content })
      .eq("id", update.id);
    if (error) {
      console.error(`  failed ${update.id}: ${error.message}`);
      continue;
    }
    written++;
  }
  console.log(`\nUpdated ${written} of ${updates.length} questions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
