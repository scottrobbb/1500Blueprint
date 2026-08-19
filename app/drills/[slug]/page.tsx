import { notFound, redirect } from "next/navigation";
import { GrammarDrill } from "@/components/drills/grammar/GrammarDrill";
import { TargetedMathDrill } from "@/components/drills/math/TargetedMathDrill";
import { ReadingDrill } from "@/components/drills/reading/ReadingDrill";
import { WordScanDrill } from "@/components/drills/wordscan/WordScanDrill";
import { VocabDrill } from "@/components/drills/vocab/VocabDrill";
import { FlashcardsDrill } from "@/components/drills/flashcards/FlashcardsDrill";
import { AiMathDrill } from "@/components/drills/aimath/AiMathDrill";
import { loadDrillQuestions } from "@/lib/drills/loadDrillContent";
import { loadGrammarMastery, loadReadingProgress, selectForStudent } from "@/lib/drills/progress";
import { calculateGrammarMastery } from "@/lib/drills/mastery";
import { calculateReadingProgress } from "@/lib/drills/readingProgress";
import { getSession } from "@/lib/auth/session";
import { getNavStats } from "@/lib/gamification/state";
import {
  toFlashcards,
  toGrammarQuestions,
  toMathQuestions,
  toReadingItems,
  toVocabItems,
} from "@/lib/drills/runtime-map";
import { DrillEmpty } from "@/components/drills/shared/DrillEmpty";
import { isAdminEmail } from "@/lib/auth/admin";
import { isDrillUnderConstruction } from "@/lib/flags";
import { loadVocabDashboard, loadVocabFlashcardDeck } from "@/lib/drills/vocab.server";

// Next 16: route params and searchParams are async.
export default async function DrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // Used to filter out questions this student has already mastered (and to recycle
  // oldest-seen-first once they've mastered the whole pool). No session => no
  // filtering, so the drill still runs.
  const session = await getSession();
  const email = session?.email ?? null;
  if (isDrillUnderConstruction(slug) && !isAdminEmail(email)) redirect("/drills");

  switch (slug) {
    case "grammar": {
      const raw = (await loadDrillQuestions("grammar")).filter(
        (question) => question.createdBy !== "scott-reading-import",
      );
      const [ordered, nav, mastery] = email
        ? await Promise.all([
            selectForStudent("grammar", email, raw),
            getNavStats(email),
            loadGrammarMastery(email),
          ])
        : [raw, null, calculateGrammarMastery([])];
      const questions = toGrammarQuestions(ordered);
      if (questions.length === 0) return <DrillEmpty title="Grammar Drill" eyebrow="Reading & Writing" />;
      return (
        <GrammarDrill
          questions={questions}
          streak={nav?.streak ?? 0}
          initialMastery={mastery}
        />
      );
    }
    case "targeted-math": {
      const difficulty = sp.difficulty === "hard" ? "hard" : "medium";
      const loaded = await loadDrillQuestions("targeted-math");
      // Two buckets: 'hard' shows hard items; 'medium' shows easy + medium, so
      // no authored difficulty is silently dropped.
      const bucket = loaded.filter((q) => (q.difficulty === "hard") === (difficulty === "hard"));
      const ordered = email ? await selectForStudent("targeted-math", email, bucket) : bucket;
      const questions = toMathQuestions(ordered);
      return <TargetedMathDrill difficulty={difficulty} questions={questions} />;
    }
    case "reading": {
      const raw = await loadDrillQuestions("reading");
      const [ordered, progress] = email
        ? await Promise.all([
            selectForStudent("reading", email, raw),
            loadReadingProgress(email),
          ])
        : [raw, calculateReadingProgress([])];
      const passages = toReadingItems(ordered);
      if (passages.length === 0)
        return <DrillEmpty title="Reading Comprehension Drill" eyebrow="Reading & Writing" />;
      return <ReadingDrill passages={passages} initialProgress={progress} />;
    }
    case "word-scan":
      return <WordScanDrill mode={sp.mode === "bad-mold" ? "bad-mold" : "ceased"} />;
    case "vocab": {
      const raw = await loadDrillQuestions("vocab");
      const [ordered, vocabState] = email
        ? await Promise.all([
            selectForStudent("vocab", email, raw),
            loadVocabDashboard(email),
          ])
        : [raw, undefined];
      const items = toVocabItems(ordered);
      if (items.length === 0) return <DrillEmpty title="Vocab Drill" eyebrow="Vocabulary" />;
      return (
        <VocabDrill
          items={items}
          wordBank={toVocabItems(raw)}
          initialState={vocabState}
          initialShowProgress={sp.view === "progress"}
        />
      );
    }
    case "flashcards": {
      if (email) {
        const deck = await loadVocabFlashcardDeck(email);
        return (
          <FlashcardsDrill
            deck={deck.cards}
            manageHref={deck.setId ? `/flashcards/${deck.setId}` : "/flashcards"}
          />
        );
      }
      return <FlashcardsDrill deck={toFlashcards(await loadDrillQuestions("flashcards"))} />;
    }
    case "ai-math":
      return <AiMathDrill />;
    default:
      notFound();
  }
}
