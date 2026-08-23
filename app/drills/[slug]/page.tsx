import { notFound, redirect } from "next/navigation";
import { GrammarDrill } from "@/components/drills/grammar/GrammarDrill";
import { TargetedMathDrill } from "@/components/drills/math/TargetedMathDrill";
import { ReadingDrill } from "@/components/drills/reading/ReadingDrill";
import { WordScanDrill } from "@/components/drills/wordscan/WordScanDrill";
import { VocabDrill } from "@/components/drills/vocab/VocabDrill";
import { FlashcardsDrill } from "@/components/drills/flashcards/FlashcardsDrill";
import { AiMathDrill } from "@/components/drills/aimath/AiMathDrill";
import { canAccessDrillPublication, loadDrillQuestions } from "@/lib/drills/loadDrillContent";
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
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { loadVocabDashboard, loadVocabFlashcardDeck } from "@/lib/drills/vocab.server";
import { drillAllowance } from "@/lib/auth/access-control";

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
  if (!session) redirect("/login");
  const email = session.email;
  const returnToUltimate = sp.workspace === "ultimate" && isUltimatePreviewEmail(email);
  const returnHref = returnToUltimate ? "/ultimate/drills" : "/drills";
  const adminPreview = isAdminEmail(email);
  if (!adminPreview && !(await drillAllowance(email)).allowed) {
    redirect(`${returnHref}?upgrade=1`);
  }
  if (!(await canAccessDrillPublication(slug, adminPreview))) {
    redirect(returnToUltimate ? "/ultimate/drills" : "/drills");
  }
  const contentOptions = { includeDraftDrill: adminPreview };

  switch (slug) {
    case "grammar": {
      const raw = await loadDrillQuestions("grammar", contentOptions);
      const [ordered, nav, mastery] = email
        ? await Promise.all([
            selectForStudent("grammar", email, raw),
            getNavStats(email),
            loadGrammarMastery(email),
          ])
        : [raw, null, calculateGrammarMastery([])];
      const questions = toGrammarQuestions(ordered);
      if (questions.length === 0) return <DrillEmpty title="Grammar Drill" eyebrow="Reading & Writing" returnHref={returnHref} />;
      return (
        <GrammarDrill
          questions={questions}
          streak={nav?.streak ?? 0}
          initialMastery={mastery}
          returnHref={returnHref}
        />
      );
    }
    case "targeted-math": {
      const difficulty = sp.difficulty === "hard" ? "hard" : "medium";
      const loaded = await loadDrillQuestions("targeted-math", contentOptions);
      // Two buckets: 'hard' shows hard items; 'medium' shows easy + medium, so
      // no authored difficulty is silently dropped.
      const bucket = loaded.filter((q) => (q.difficulty === "hard") === (difficulty === "hard"));
      const ordered = email ? await selectForStudent("targeted-math", email, bucket) : bucket;
      const questions = toMathQuestions(ordered);
      return <TargetedMathDrill difficulty={difficulty} questions={questions} returnHref={returnHref} />;
    }
    case "reading": {
      const raw = await loadDrillQuestions("reading", contentOptions);
      const [ordered, progress] = email
        ? await Promise.all([
            selectForStudent("reading", email, raw),
            loadReadingProgress(email),
          ])
        : [raw, calculateReadingProgress([])];
      const passages = toReadingItems(ordered);
      if (passages.length === 0)
        return <DrillEmpty title="Reading Comprehension Drill" eyebrow="Reading & Writing" returnHref={returnHref} />;
      return <ReadingDrill passages={passages} initialProgress={progress} returnHref={returnHref} />;
    }
    case "word-scan":
      return <WordScanDrill mode={sp.mode === "bad-mold" ? "bad-mold" : "ceased"} returnHref={returnHref} />;
    case "vocab": {
      const raw = await loadDrillQuestions("vocab", contentOptions);
      const [ordered, vocabState] = email
        ? await Promise.all([
            selectForStudent("vocab", email, raw),
            loadVocabDashboard(email),
          ])
        : [raw, undefined];
      const items = toVocabItems(ordered);
      if (items.length === 0) return <DrillEmpty title="Vocab Drill" eyebrow="Vocabulary" returnHref={returnHref} />;
      return (
        <VocabDrill
          items={items}
          wordBank={toVocabItems(raw)}
          initialState={vocabState}
          initialShowProgress={sp.view === "progress"}
          returnHref={returnHref}
        />
      );
    }
    case "flashcards": {
      if (email) {
        const deck = await loadVocabFlashcardDeck(email);
        return (
          <FlashcardsDrill
            deck={deck.cards}
            manageHref={returnToUltimate ? "/ultimate/flashcards" : deck.setId ? `/flashcards/${deck.setId}` : "/flashcards"}
            returnHref={returnHref}
          />
        );
      }
      return <FlashcardsDrill deck={toFlashcards(await loadDrillQuestions("flashcards", contentOptions))} returnHref={returnHref} />;
    }
    case "ai-math":
      return <AiMathDrill returnHref={returnHref} />;
    default:
      notFound();
  }
}
