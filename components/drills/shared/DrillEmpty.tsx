import Link from "next/link";
import { DrillShell } from "./DrillShell";
import { surface, secondaryBtn } from "./ui";

// Shown when a DB-backed drill has no published questions yet, instead of
// silently falling back to a mock the AI grader can't grade.
export function DrillEmpty({
  title,
  eyebrow,
  returnHref = "/drills",
}: {
  title: string;
  eyebrow?: string;
  returnHref?: string;
}) {
  return (
    <DrillShell title={title} eyebrow={eyebrow} exitHref={returnHref}>
      <div className={`mx-auto mt-10 max-w-md ${surface} px-6 py-8 text-center`}>
        <h2 className="font-display text-xl font-bold text-ink">No questions published yet</h2>
        <p className="mt-2 text-sm text-navy/55">
          This drill has no published questions yet. Add some in the admin editor, then check back.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href={returnHref} className={secondaryBtn}>
            Back to drills
          </Link>
        </div>
      </div>
    </DrillShell>
  );
}
