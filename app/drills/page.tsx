import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { PlayerBanner } from "@/components/hub/PlayerBanner";
import { StatsCard } from "@/components/hub/StatsCard";
import { Leaderboard } from "@/components/hub/Leaderboard";
import { Achievements } from "@/components/hub/Achievements";
import { DrillCatalog } from "@/components/hub/DrillCatalog";
import { OnboardingTour } from "@/components/hub/OnboardingTour";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { getHubState, needsOnboarding } from "@/lib/gamification/state";
import { loadGrammarMastery } from "@/lib/drills/progress";
import { loadVocabDashboard } from "@/lib/drills/vocab.server";
import { listDrills } from "@/lib/drills/admin-queries";

export const metadata = {
  title: "Practice Drills | 1500 SAT Blueprint",
  description:
    "Earn XP, build streaks, and master one SAT skill at a time with short drills graded on your reasoning, not just your answer.",
};

export default async function DrillsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [hub, showOnboarding, grammarMastery, vocabState, drills] = await Promise.all([
    getHubState(session.email),
    needsOnboarding(session.email),
    loadGrammarMastery(session.email),
    loadVocabDashboard(session.email),
    listDrills(),
  ]);
  const nav = {
    streak: hub.player.streak,
    level: hub.player.level,
    xp: hub.player.xp,
    name: hub.player.name,
    initials: hub.player.initials,
    avatarUrl: hub.player.avatarUrl,
    plan: hub.player.plan,
    isAdmin: isAdminEmail(session.email),
  };

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="drills" stats={nav} />
      <PlayerBanner player={hub.player} />
      <StatsCard
        player={hub.player}
        weeklyStreak={hub.weeklyStreak}
        todayIndex={hub.todayIndex}
        dailyGoal={hub.dailyGoal}
      />

      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 items-start gap-[22px] px-6 pt-[26px] lg:grid-cols-[360px_1fr]">
        <Leaderboard leaderboard={hub.leaderboard} player={hub.player} />
        <Achievements data={hub.achievements} />
      </div>

      <DrillCatalog
        grammarMastery={grammarMastery}
        vocabStats={{
          words: vocabState.totalWords,
          mastered: vocabState.masteredCount,
          bestStreak: vocabState.bestStreak,
          flashcards: vocabState.flashcardCount,
        }}
        streak={hub.player.streak}
        isAdmin={nav.isAdmin}
        publication={Object.fromEntries(drills.map((drill) => [drill.slug, drill.status]))}
      />

      {showOnboarding && (
        <OnboardingTour firstName={hub.player.firstName} dailyTarget={hub.dailyGoal.total} />
      )}

      <footer className="mx-auto w-full max-w-[1120px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 SAT Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </div>
  );
}
