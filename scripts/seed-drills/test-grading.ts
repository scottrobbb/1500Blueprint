/** Live test of the AI grading pipelines. Replicates exactly what the grading
 *  routes do (system = the drill's editable grading_prompt; user = the question
 *  or passage + the checkable points + student text) and grades a STRONG vs
 *  WEAK answer so the differentiation is visible.
 *  Run: npx tsx scripts/seed-drills/test-grading.ts */
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.resolve(".env.local"));

const MODEL = process.env.EXPLAIN_MODEL ?? "claude-opus-4-8";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SECRET_KEY ?? "", {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

async function grade(system: string, user: string) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  let text = "";
  for (const b of resp.content) if (b.type === "text") text += b.text;
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return JSON.parse(text.slice(s, e + 1));
}

async function grammar() {
  const { data: drill } = await admin.from("drills").select("grading_prompt").eq("slug", "grammar").single();
  const { data: qs } = await admin
    .from("drill_questions")
    .select("id,stem,passage,content,drill_walkthrough_steps(position,kind,text,detail)")
    .eq("drill_slug", "grammar")
    .eq("status", "published")
    .limit(1);
  const q = qs![0];
  const c = q.content as { choices: { id: string; text: string }[]; correct: string };
  const steps = ((q.drill_walkthrough_steps ?? []) as { position: number; kind: string; text: string; detail?: string }[]).sort((a, b) => a.position - b.position);
  const choiceLines = c.choices.map((x) => `${x.id}. ${x.text}`).join("\n");
  const stepLines = steps.map((s, i) => `${i + 1}. [${s.kind}] ${s.text}${s.detail ? ` — ${s.detail}` : ""}`).join("\n");

  const strong = steps.map((s) => `${s.text}${s.detail ? `: ${s.detail}` : ""}`).join(" Then ");
  const weak = "I just picked the choice that sounded smoothest when I read it out loud. The others felt off but I couldn't say why.";

  const build = (studentText: string) =>
    [
      `Passage:\n${q.passage}`,
      `Question:\n${q.stem}`,
      `Choices:\n${choiceLines}`,
      `Correct answer: ${c.correct}`,
      `Critical-path steps (the ideal reasoning, in order):\n${stepLines}`,
      `Student's explanation:\n${studentText}`,
      'Return strict JSON only: {"score":0-100,"verdict":"<one line>","feedback":"<prose>","stepsMissed":["<step>", ...]}.',
    ].join("\n\n");

  console.log(`\n===== GRAMMAR (grade-process) — question ${q.id} =====`);
  console.log(`Stem: ${q.stem}`);
  const a = await grade(drill!.grading_prompt, build(strong));
  console.log(`\n[STRONG answer, follows the critical path]`);
  console.log(`  score=${a.score}  verdict="${a.verdict}"  stepsMissed=${a.stepsMissed?.length ?? 0}`);
  const b = await grade(drill!.grading_prompt, build(weak));
  console.log(`\n[WEAK answer, vague guess]`);
  console.log(`  score=${b.score}  verdict="${b.verdict}"  stepsMissed=${b.stepsMissed?.length ?? 0}`);
}

async function reading() {
  const { data: drill } = await admin.from("drills").select("grading_prompt").eq("slug", "reading").single();
  // Reading passages are generated per attempt, so grade the most recent one
  // rather than an authored question. Run the drill once to seed a row.
  const { data: rows } = await admin
    .from("reading_generated_passages")
    .select("id,body,core_points,depth_points")
    .order("created_at", { ascending: false })
    .limit(1);
  const p = rows?.[0];
  if (!p) {
    console.log("\n===== READING — skipped: no generated passage yet (run the drill once) =====");
    return;
  }
  const points = (list: { label: string; text: string }[]) =>
    list.map((x, i) => `${i + 1}. [${x.label}] ${x.text}`).join("\n");
  const core = p.core_points as { label: string; text: string }[];
  const depth = p.depth_points as { label: string; text: string }[];

  const strong = [...core, ...depth].map((x) => x.text).join(" ");
  const weak = "It was about some science discovery, I think. I don't really remember the specifics.";

  const build = (studentText: string) =>
    [
      `Passage:\n${(p.body as string[]).join("\n\n")}`,
      `CORE points (the main idea and resolution):\n${points(core)}`,
      `DEPTH points (the supporting layer):\n${points(depth)}`,
      `Student's summary:\n${studentText}`,
      'Return strict JSON only: {"verdict":"<one sentence>","core":[{"label":"<label>","recall":"full|partial|missed"}, ...],"depth":[{"label":"<label>","recall":"full|partial|missed"}, ...],"fabrications":["<unsupported claim>", ...]}.',
    ].join("\n\n");

  // Mirrors scoreReadingRecall: core is weighted at 80%, depth at 20%.
  const credit: Record<string, number> = { full: 1, partial: 0.5, missed: 0 };
  const ratio = (list: { recall: string }[] = []) =>
    list.length === 0 ? 1 : list.reduce((sum, x) => sum + (credit[x.recall] ?? 0), 0) / list.length;
  const score = (r: { core?: { recall: string }[]; depth?: { recall: string }[]; fabrications?: string[] }) =>
    Math.max(0, Math.round((0.8 * ratio(r.core) + 0.2 * ratio(r.depth)) * 100) - Math.min(20, (r.fabrications?.length ?? 0) * 5));

  console.log(`\n===== READING (recall grading) — passage ${p.id} =====`);
  const a = await grade(drill!.grading_prompt, build(strong));
  console.log(`\n[STRONG summary, recalls every point]`);
  console.log(`  score=${score(a)}  verdict="${a.verdict}"`);
  const b = await grade(drill!.grading_prompt, build(weak));
  console.log(`\n[WEAK summary, gist only]`);
  console.log(`  score=${score(b)}  verdict="${b.verdict}"`);
}

async function main() {
  await grammar();
  await reading();
  console.log("\n(Done. This runs the same Claude calls + Scott's grading_prompts the live grading routes use.)");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
