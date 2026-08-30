import { notFound } from "next/navigation";
import { Achievements } from "@/components/hub/Achievements";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { DrillCatalog } from "@/components/hub/DrillCatalog";
import { Leaderboard } from "@/components/hub/Leaderboard";
import { OnboardingTour } from "@/components/hub/OnboardingTour";
import { PlayerBanner } from "@/components/hub/PlayerBanner";
import { StatsCard } from "@/components/hub/StatsCard";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { loadGrammarMastery } from "@/lib/drills/progress";
import { loadVocabDashboard } from "@/lib/drills/vocab.server";
import { getHubState, needsOnboarding } from "@/lib/gamification/state";
import { listDrills } from "@/lib/drills/admin-queries";

export const metadata = { title: "Drills" };

export default async function UltimateDrillsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const isAdmin = isAdminEmail(session.email);
  const access = await getStudentAccess(session.email);
  if (!isAdmin && access.entitlements.dailyDrillLimit === null) {
    return <AccessGate title="Unlock daily skill drills" description="Max includes unlimited daily drills, so you can practice as much as you want." currentPlan={access.plan} />;
  }

  const [hub, showOnboarding, grammarMastery, vocabState, drills] = await Promise.all([
    getHubState(session.email),
    needsOnboarding(session.email),
    loadGrammarMastery(session.email),
    loadVocabDashboard(session.email),
    listDrills(),
  ]);

  return (
    <div className="min-h-dvh bg-haze">
      <PlayerBanner player={hub.player} />
      <StatsCard
        player={hub.player}
        weeklyStreak={hub.weeklyStreak}
        todayIndex={hub.todayIndex}
        dailyGoal={hub.dailyGoal}
      />

      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 items-start gap-[22px] px-4 pt-[26px] sm:px-6 lg:grid-cols-[360px_1fr]">
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
        isAdmin={isAdmin}
        publication={Object.fromEntries(drills.map((drill) => [drill.slug, drill.status]))}
        workspace="ultimate"
      />

      {showOnboarding && <OnboardingTour firstName={hub.player.firstName} dailyTarget={hub.dailyGoal.total} />}
    </div>
  );
}
