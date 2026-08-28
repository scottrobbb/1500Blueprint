"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/shell/Avatar";
import { AvatarCropper } from "@/components/shell/AvatarCropper";
import {
  removeProfileAvatar,
  uploadProfileAvatar,
} from "@/lib/profile/avatar-client";
import { validateProfileName } from "@/lib/settings/profile-name";
import type { PlanCode } from "@/lib/auth/plans";
import type { AccountAchievement } from "@/lib/settings/data";

type ProfileSettingsCardProps = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  createdAt: string | null;
  plan: PlanCode;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  weeklyRank: number | null;
  achievementCount: number;
  achievementTotal: number;
  achievements: AccountAchievement[];
  testDate: string | null;
  allowReservedName?: boolean;
};

export function ProfileSettingsCard({
  name,
  email,
  avatarUrl,
  createdAt,
  plan,
  xp,
  level,
  currentStreak,
  longestStreak,
  weeklyRank,
  achievementCount,
  achievementTotal,
  achievements,
  testDate,
  allowReservedName = false,
}: ProfileSettingsCardProps) {
  const router = useRouter();
  const [savedName, setSavedName] = useState(name ?? "");
  const [draftName, setDraftName] = useState(name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalizedSavedName = savedName.trim();
  const displayName = normalizedSavedName || "Name not set";
  const initialsSource = normalizedSavedName || email.split("@")[0] || "Student";
  const initials = initialsSource
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    const validation = validateProfileName(draftName, { allowReserved: allowReservedName });
    if (!validation.valid) {
      setProfileError(validation.message);
      return;
    }

    setProfileBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: validation.name }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { name?: string; message?: string }
        | null;
      if (!response.ok || !payload?.name) {
        throw new Error(payload?.message ?? "Could not save your name. Please try again.");
      }
      setSavedName(payload.name);
      setDraftName(payload.name);
      setIsEditingName(false);
      setProfileMessage("Name updated.");
      router.refresh();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not save your name.");
    } finally {
      setProfileBusy(false);
    }
  }

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError(null);
    setPendingImage(file);
  }

  async function saveImage(blob: Blob) {
    setImageBusy(true);
    setImageError(null);
    try {
      const url = await uploadProfileAvatar(blob);
      setCurrentAvatar(url);
      setPendingImage(null);
      router.refresh();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not upload your photo.");
    } finally {
      setImageBusy(false);
    }
  }

  async function removeImage() {
    setImageBusy(true);
    setImageError(null);
    try {
      await removeProfileAvatar();
      setCurrentAvatar(null);
      setPhotoMenuOpen(false);
      router.refresh();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not remove your photo.");
    } finally {
      setImageBusy(false);
    }
  }

  const hiddenAchievementCount = Math.max(0, achievementCount - achievements.length);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-navy/10 bg-white">
      <div className="relative h-28 bg-[linear-gradient(110deg,#0b2a5b,#2164a7_65%,#3fa9f5)] sm:h-32">
        {achievements.length > 0 ? (
          <div className="absolute bottom-4 right-5 flex -space-x-2 sm:bottom-5 sm:right-7" aria-label="Recent achievements">
            {achievements.map((achievement) => (
              <AchievementBadge key={achievement.id} achievement={achievement} />
            ))}
            {hiddenAchievementCount > 0 ? (
              <span className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-white text-xs font-extrabold text-brand-600 shadow-sm sm:h-11 sm:w-11">
                +{hiddenAchievementCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <div className="relative z-10 -mt-12 flex-none">
              <Avatar
                src={currentAvatar}
                initials={initials}
                alt={displayName}
                className="h-24 w-24 border-4 border-white text-xl"
              />
              <button
                type="button"
                disabled={imageBusy}
                aria-label={currentAvatar ? "Edit profile photo" : "Add profile photo"}
                aria-expanded={currentAvatar ? photoMenuOpen : undefined}
                onClick={() => {
                  if (currentAvatar) {
                    setPhotoMenuOpen((open) => !open);
                  } else {
                    fileRef.current?.click();
                  }
                }}
                className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-[3px] border-white bg-brand text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <CameraIcon />
              </button>
              {currentAvatar && photoMenuOpen ? (
                <div className="absolute left-1/2 top-full z-20 mt-2 w-36 -translate-x-1/2 rounded-xl border border-navy/10 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      fileRef.current?.click();
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-navy hover:bg-haze"
                  >
                    Change photo
                  </button>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-danger-600 hover:bg-danger-bg"
                  >
                    Remove photo
                  </button>
                </div>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={pickImage}
                className="hidden"
              />
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              {isEditingName ? (
                <form onSubmit={saveName} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="profile-display-name">Display name</label>
                  <input
                    id="profile-display-name"
                    type="text"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    autoComplete="name"
                    autoFocus
                    disabled={profileBusy}
                    className="min-h-10 min-w-0 flex-1 rounded-xl border-2 border-brand/40 bg-white px-3 text-sm font-bold text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-haze"
                    placeholder="Your name"
                  />
                  <button
                    type="submit"
                    disabled={profileBusy || draftName.trim() === savedName.trim()}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-xs font-extrabold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {profileBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={profileBusy}
                    onClick={() => {
                      setDraftName(savedName);
                      setProfileError(null);
                      setIsEditingName(false);
                    }}
                    className="inline-flex min-h-10 items-center justify-center px-2 text-xs font-bold text-navy/55 hover:text-navy disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate font-display text-2xl font-extrabold tracking-[-0.025em] text-navy">
                    {displayName}
                  </h2>
                  <button
                    type="button"
                    aria-label="Edit display name"
                    onClick={() => {
                      setDraftName(savedName);
                      setProfileError(null);
                      setProfileMessage(null);
                      setIsEditingName(true);
                    }}
                    className="grid h-8 w-8 flex-none place-items-center rounded-lg text-navy/45 transition-colors hover:bg-haze hover:text-navy"
                  >
                    <PencilIcon />
                  </button>
                </div>
              )}
              <span className="mt-1.5 inline-flex rounded-full bg-ice px-3 py-1 text-xs font-extrabold text-brand-600">
                {formatPlan(plan)}
              </span>
              <span aria-live="polite" className={`ml-3 text-xs font-semibold ${profileError ? "text-danger-600" : "text-success-600"}`}>
                {profileError ?? profileMessage}
              </span>
            </div>
          </div>
        </div>

        {imageError ? <p role="alert" className="mt-3 text-xs font-semibold text-danger-600">{imageError}</p> : null}

        <div className="my-7 h-0.5 bg-navy/[0.07]" />

        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-8">
          <div className="space-y-4">
            <ProfileDetail icon={<EmailIcon />} value={email} />
            {createdAt ? <ProfileDetail icon={<CalendarIcon />} value={`Joined ${formatDate(createdAt)}`} /> : null}
            {testDate ? <ProfileDetail icon={<TargetIcon />} value={`SAT on ${formatDate(testDate)}`} /> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ProfileStat label="Current streak" value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`} />
            <ProfileStat label="Longest streak" value={`${longestStreak} ${longestStreak === 1 ? "day" : "days"}`} />
            <ProfileStat label="Total XP" value={xp.toLocaleString()} />
            <ProfileStat label="Level" value={level.toLocaleString()} />
            <ProfileStat label="Weekly rank" value={weeklyRank ? `#${weeklyRank}` : "—"} />
            <ProfileStat label="Achievements" value={`${achievementCount} of ${achievementTotal}`} />
          </div>
        </div>

      </div>

      {pendingImage ? (
        <AvatarCropper
          file={pendingImage}
          busy={imageBusy}
          error={imageError}
          onCancel={() => {
            setPendingImage(null);
            setImageError(null);
          }}
          onSave={saveImage}
        />
      ) : null}
    </section>
  );
}

function ProfileDetail({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-navy/55">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-haze text-navy/38">{icon}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 rounded-xl bg-haze px-4 py-4">
      <p className="text-xs font-bold text-navy/45">{label}</p>
      <p className="mt-2 font-display text-xl font-extrabold tracking-[-0.02em] text-navy sm:text-2xl">{value}</p>
    </div>
  );
}

const ACHIEVEMENT_COLORS: Record<AccountAchievement["category"], { background: string; foreground: string }> = {
  xp: { background: "#fff2c7", foreground: "#b77900" },
  level: { background: "#e4f4ff", foreground: "#278ed8" },
  streak: { background: "#ffeadb", foreground: "#e86817" },
  drills: { background: "#e8edff", foreground: "#3456b2" },
  tests: { background: "#e6f8ed", foreground: "#16834b" },
  goals: { background: "#e3f7f5", foreground: "#0d8a82" },
  milestone: { background: "#f0e9ff", foreground: "#7440c7" },
};

function AchievementBadge({ achievement }: { achievement: AccountAchievement }) {
  const color = ACHIEVEMENT_COLORS[achievement.category];
  return (
    <span
      title={achievement.label}
      aria-label={achievement.label}
      className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-white shadow-sm sm:h-11 sm:w-11"
      style={{ background: color.background, color: color.foreground }}
    >
      <AchievementIcon category={achievement.category} />
    </span>
  );
}

function AchievementIcon({ category }: { category: AccountAchievement["category"] }) {
  const common = { className: "h-5 w-5", "aria-hidden": true as const };
  if (category === "xp") {
    return <svg {...common} viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.3 6.1 6.2 2.3-6.2 2.3-2.3 7.7-2.3-7.7-6.2-2.3 6.2-2.3L12 2.8Z" /></svg>;
  }
  if (category === "level") {
    return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 13 6-5 6 5M6 18l6-5 6 5" /></svg>;
  }
  if (category === "streak") {
    return <svg {...common} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3s5 3.5 5 8.5a5 5 0 0 1-10 0c0-1.6.6-2.8 1.3-3.6.2 1.2.9 1.9 1.7 2.1C9.4 7.8 12 6.3 12 3Z" /></svg>;
  }
  if (category === "drills") {
    return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 9v6M4 8.5v7M17.5 9v6M20 8.5v7M6.5 12h11" /></svg>;
  }
  if (category === "tests") {
    return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-4 9 4-9 4-9-4Z" /><path d="M7 11v4c0 1.4 10 1.4 10 0v-4M21 9v4" /></svg>;
  }
  if (category === "goals") {
    return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
  }
  return <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 14.5 9.5 18h5l-.5-3.5M8 20h8" /></svg>;
}

function EmailIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" strokeLinejoin="round" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 9h16" strokeLinecap="round" /></svg>;
}

function TargetIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
}

function CameraIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8.5h2.2l1.3-2h7l1.3 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" /><circle cx="12" cy="14" r="3" /></svg>;
}

function PencilIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l10.8-10.8a2.3 2.3 0 0 0-3.2-3.2L4.8 16.8 4 16Z" /><path d="m14.5 7.1 3.2 3.2" /></svg>;
}

function formatPlan(plan: PlanCode): string {
  if (plan === "max") return "Max";
  if (plan === "core") return "Core";
  return "Free";
}

function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
