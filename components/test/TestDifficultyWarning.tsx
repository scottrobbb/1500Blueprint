import { cookies } from "next/headers";
import { DIFFICULTY_WARNING_COOKIE } from "@/lib/sat/difficulty-warning";
import { TestDifficultyWarningBanner } from "./TestDifficultyWarningBanner";

// Red notice on the test library pages: our tests run harder than the real SAT.
// Students can close it for good; the cookie keeps it out of the server render.
export async function TestDifficultyWarning({ className = "" }: { className?: string }) {
  const cookieStore = await cookies();
  if (cookieStore.has(DIFFICULTY_WARNING_COOKIE)) return null;
  return <TestDifficultyWarningBanner className={className} />;
}
