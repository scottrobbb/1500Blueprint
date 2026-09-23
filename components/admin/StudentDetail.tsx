import Link from "next/link";
import type { Course } from "@/lib/courses/types";
import type { QuestionBankDashboard, QuestionBankSection } from "@/lib/question-bank/dashboard";
import type { ModuleAttemptRecord } from "@/lib/sat/moduleAttempts";
import type {
  CompletedTestAttempt,
  HubState,
  StudentRow,
} from "@/lib/gamification/state";

// Roster drill keys carry slugs; these are the labels used on the student's own
// surfaces, so the admin view names them the same way.
const DRILL_LABELS: Record<string, string> = {
  grammar: "Grammar",
  reading: "Reading",
  "targeted-math": "Targeted Math",
  vocab: "Vocab",
};

const SECTION_LABELS: Record<QuestionBankSection, string> = {
  rw: "Reading & Writing",
  math: "Math",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Never";
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-navy/12 bg-white p-4">
      <div className="text-xs text-navy/50">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-navy/45">{hint}</div> : null}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-navy/[0.07]">
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums text-navy/55">{percent}%</span>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-navy/12 bg-white p-4 text-sm text-navy/55">{children}</p>
  );
}

function percentOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-display text-lg font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function StudentDetail({
  student,
  progress,
  attempts,
  testTitles,
  moduleAttempts,
  courses,
  questionBank,
}: {
  student: StudentRow;
  progress: HubState | null;
  attempts: CompletedTestAttempt[];
  testTitles: Record<string, string>;
  moduleAttempts: ModuleAttemptRecord[] | null;
  courses: { course: Course; locked: boolean }[] | null;
  questionBank: QuestionBankDashboard | null;
}) {
  const newestFirst = [...attempts].reverse();
  const scored = attempts.filter(
    (attempt): attempt is CompletedTestAttempt & { totalScore: number } =>
      typeof attempt.totalScore === "number",
  );
  const best = scored.length ? Math.max(...scored.map((a) => a.totalScore)) : null;
  const latest = scored.at(-1);
  const first = scored[0];
  const improvement = latest && first && scored.length > 1 ? latest.totalScore - first.totalScore : null;
  const drills = Object.entries(student.perDrill);

  return (
    <div>
      <Link href="/ultimate/admin/students" className="text-sm font-semibold text-brand-600 hover:underline">
        Back to students
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-4 rounded-card border border-navy/15 bg-white p-5">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#3fa9f5,#0b2a5b)] font-display text-lg font-bold text-white">
          {student.initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-extrabold text-ink">{student.name}</h1>
          <div className="truncate text-sm text-navy/55">{student.email}</div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-navy/50">Plan</dt>
            <dd className="font-semibold capitalize text-ink">
              {student.plan}
              {student.isComplimentary ? " (complimentary)" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-navy/50">Account</dt>
            <dd className="font-semibold capitalize text-ink">{student.accountStatus}</dd>
          </div>
          <div>
            <dt className="text-xs text-navy/50">Joined</dt>
            <dd className="font-semibold text-ink">{formatDate(student.joined)}</dd>
          </div>
          <div>
            <dt className="text-xs text-navy/50">Last active</dt>
            <dd className="font-semibold text-ink">{formatDate(student.lastActive)}</dd>
          </div>
        </dl>
      </header>

      <Section title="Progress">
        {progress ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Level"
              value={String(progress.player.level)}
              hint={`${progress.player.xp.toLocaleString()} XP`}
            />
            <Stat label="Streak" value={`${progress.player.streak} days`} />
            <Stat
              label="Daily goal"
              value={`${progress.dailyGoal.done} / ${progress.dailyGoal.total}`}
              hint="Today"
            />
            <Stat
              label="Achievements"
              value={`${progress.achievements.unlocked} / ${progress.achievements.total}`}
            />
          </div>
        ) : (
          <p className="rounded-card border border-navy/12 bg-white p-4 text-sm text-navy/55">
            Progress could not be loaded for this student.
          </p>
        )}
      </Section>

      <Section title="Drills">
        {drills.length ? (
          <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-navy/10 bg-mist text-left">
                  <th className="px-4 py-3 font-semibold text-navy/70">Drill</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Attempted</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Mastered</th>
                </tr>
              </thead>
              <tbody>
                {drills.map(([slug, stat]) => (
                  <tr key={slug} className="border-b border-navy/8 last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{DRILL_LABELS[slug] ?? slug}</td>
                    <td className="px-4 py-3 text-navy/70">{stat.attempted}</td>
                    <td className="px-4 py-3 text-navy/70">{stat.mastered}</td>
                  </tr>
                ))}
                <tr className="bg-mist/60">
                  <td className="px-4 py-3 font-semibold text-ink">Total</td>
                  <td className="px-4 py-3 font-semibold text-ink">{student.totalAttempted}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{student.totalMastered}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-card border border-navy/12 bg-white p-4 text-sm text-navy/55">
            No drill activity yet.
          </p>
        )}
      </Section>

      <CoursesSection courses={courses} />

      <QuestionBankSection dashboard={questionBank} />

      <Section title="Practice tests">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Tests taken" value={String(attempts.length)} />
          <Stat label="Best score" value={best === null ? "None" : String(best)} />
          <Stat
            label="Change"
            value={improvement === null ? "None" : `${improvement > 0 ? "+" : ""}${improvement}`}
            hint={improvement === null ? "Needs two scored tests" : "First to latest"}
          />
        </div>
        {newestFirst.length ? (
          <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-navy/10 bg-mist text-left">
                  <th className="px-4 py-3 font-semibold text-navy/70">Test</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Taken</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Total</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">R&amp;W</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Math</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((attempt) => (
                  <tr key={attempt.id} className="border-b border-navy/8 last:border-b-0 hover:bg-brand/5">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {attempt.testTitle ?? testTitles[attempt.testSlug] ?? attempt.testSlug}
                    </td>
                    <td className="px-4 py-3 text-navy/70">{formatDate(attempt.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{attempt.totalScore ?? "—"}</td>
                    <td className="px-4 py-3 text-navy/70">{attempt.rwScore ?? "—"}</td>
                    <td className="px-4 py-3 text-navy/70">{attempt.mathScore ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ultimate/admin/students/${encodeURIComponent(student.email)}/attempts/${attempt.id}`}
                        className="font-semibold text-brand-600 hover:underline"
                      >
                        View report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-card border border-navy/12 bg-white p-4 text-sm text-navy/55">
            This student has not completed a full-length test.
          </p>
        )}
      </Section>

      <ModulePracticeSection
        email={student.email}
        attempts={moduleAttempts}
        testTitles={testTitles}
      />
    </div>
  );
}

function CoursesSection({ courses }: { courses: { course: Course; locked: boolean }[] | null }) {
  if (!courses) {
    return (
      <Section title="Courses">
        <EmptyNote>Course progress could not be loaded for this student.</EmptyNote>
      </Section>
    );
  }

  // Overall totals count only the courses the student can open, matching the
  // numbers on their own Courses page.
  const unlocked = courses.filter((row) => !row.locked).map((row) => row.course);
  const totalLessons = unlocked.reduce((sum, course) => sum + course.totalLessons, 0);
  const completedLessons = unlocked.reduce((sum, course) => sum + course.completedLessons, 0);
  const started = unlocked.filter((course) => course.completedLessons > 0).length;

  return (
    <Section title="Courses">
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Lessons complete" value={`${completedLessons} / ${totalLessons}`} />
        <Stat label="Overall progress" value={`${percentOf(completedLessons, totalLessons)}%`} />
        <Stat label="Courses started" value={`${started} / ${unlocked.length}`} />
      </div>
      {courses.length ? (
        <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-navy/10 bg-mist text-left">
                <th className="px-4 py-3 font-semibold text-navy/70">Course</th>
                <th className="px-4 py-3 font-semibold text-navy/70">Lessons</th>
                <th className="w-1/3 px-4 py-3 font-semibold text-navy/70">Progress</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(({ course, locked }) => (
                <tr key={course.id} className="border-b border-navy/8 align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{course.title}</div>
                    {locked ? <div className="text-xs text-navy/45">Not included in their plan</div> : null}
                    {course.completedLessons > 0 ? (
                      <details className="mt-1 text-xs text-navy/60">
                        <summary className="cursor-pointer font-semibold text-brand-600">Modules</summary>
                        <ul className="mt-2 space-y-1">
                          {course.modules.map((module) => {
                            const done = module.lessons.filter((lesson) => lesson.completed).length;
                            return (
                              <li key={module.id} className="flex justify-between gap-4">
                                <span>{module.title}</span>
                                <span className="tabular-nums">{done} / {module.lessons.length}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-navy/70">
                    {course.completedLessons} / {course.totalLessons}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar percent={course.progress} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote>No courses are published yet.</EmptyNote>
      )}
    </Section>
  );
}

function QuestionBankSection({ dashboard }: { dashboard: QuestionBankDashboard | null }) {
  if (!dashboard) {
    return (
      <Section title="Question Bank">
        <EmptyNote>Question Bank progress could not be loaded for this student.</EmptyNote>
      </Section>
    );
  }

  const { summary } = dashboard;
  const topics = dashboard.topics
    .filter((topic) => topic.attempts > 0)
    .sort((a, b) => a.section.localeCompare(b.section) || b.attempts - a.attempts);

  return (
    <Section title="Question Bank">
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Questions answered" value={summary.attempted.toLocaleString()} />
        <Stat
          label="Accuracy"
          value={summary.attempted ? `${summary.accuracy}%` : "None"}
          hint={summary.attempted ? `${summary.correct.toLocaleString()} correct` : undefined}
        />
        <Stat label="Saved questions" value={summary.saved.toLocaleString()} />
        <Stat label="Streak" value={`${summary.streak} days`} />
      </div>
      {summary.attempted ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-navy/10 bg-mist text-left">
                  <th className="px-4 py-3 font-semibold text-navy/70">Subject</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Unique solved</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.subjects.map((subject) => (
                  <tr key={subject.section} className="border-b border-navy/8 align-top last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{SECTION_LABELS[subject.section]}</td>
                    <td className="px-4 py-3">
                      <div className="mb-1 tabular-nums text-navy/70">
                        {subject.solved.toLocaleString()} / {subject.available.toLocaleString()}
                      </div>
                      <ProgressBar percent={percentOf(subject.solved, subject.available)} />
                    </td>
                    <td className="px-4 py-3 text-navy/70">
                      {subject.attempts ? `${subject.accuracy}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-navy/10 bg-mist text-left">
                  <th className="px-4 py-3 font-semibold text-navy/70">Topic</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Answered</th>
                  <th className="px-4 py-3 font-semibold text-navy/70">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <tr key={`${topic.section}:${topic.domain}`} className="border-b border-navy/8 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{topic.domain}</div>
                      <div className="text-xs text-navy/45">{SECTION_LABELS[topic.section]}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-navy/70">{topic.attempts}</td>
                    <td className="px-4 py-3 tabular-nums text-navy/70">{topic.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyNote>This student has not answered any Question Bank questions.</EmptyNote>
      )}
    </Section>
  );
}

function ModulePracticeSection({
  email,
  attempts,
  testTitles,
}: {
  email: string;
  attempts: ModuleAttemptRecord[] | null;
  testTitles: Record<string, string>;
}) {
  if (!attempts) {
    return (
      <Section title="Single-module practice">
        <EmptyNote>Module practice could not be loaded for this student.</EmptyNote>
      </Section>
    );
  }

  return (
    <Section title="Single-module practice">
      {attempts.length ? (
        <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-navy/10 bg-mist text-left">
                <th className="px-4 py-3 font-semibold text-navy/70">Module</th>
                <th className="px-4 py-3 font-semibold text-navy/70">Taken</th>
                <th className="px-4 py-3 font-semibold text-navy/70">Score</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id} className="border-b border-navy/8 last:border-b-0 hover:bg-brand/5">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{attempt.label}</div>
                    <div className="text-xs text-navy/45">{testTitles[attempt.testSlug] ?? attempt.testSlug}</div>
                  </td>
                  <td className="px-4 py-3 text-navy/70">{formatDate(attempt.createdAt)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className="font-semibold text-ink">{attempt.correct} / {attempt.total}</span>
                    <span className="ml-2 text-navy/50">{percentOf(attempt.correct, attempt.total)}%</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/ultimate/admin/students/${encodeURIComponent(email)}/modules/${attempt.id}`}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      View review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote>This student has not practiced a single module.</EmptyNote>
      )}
    </Section>
  );
}
