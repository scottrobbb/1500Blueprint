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

type ProfileSettingsCardProps = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  createdAt: string | null;
};

export function ProfileSettingsCard({
  name,
  email,
  avatarUrl,
  createdAt,
}: ProfileSettingsCardProps) {
  const router = useRouter();
  const [savedName, setSavedName] = useState(name ?? "");
  const [draftName, setDraftName] = useState(name ?? "");
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = savedName || email.split("@")[0] || "Student";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    const validation = validateProfileName(draftName);
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
      router.refresh();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not remove your photo.");
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-[0_18px_45px_-36px_rgba(11,42,91,0.55)]">
      <div className="relative h-28 overflow-hidden bg-[linear-gradient(120deg,#0b2a5b,#174b91_58%,#3fa9f5)]">
        <div aria-hidden className="absolute -right-14 -top-28 h-64 w-64 rounded-full border-[38px] border-white/[0.06]" />
        <div aria-hidden className="absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-sky/10 blur-3xl" />
      </div>

      <div className="px-5 pb-6 sm:px-7 sm:pb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <Avatar
              src={currentAvatar}
              initials={initials}
              alt={displayName}
              className="relative z-10 -mt-11 h-[88px] w-[88px] flex-none border-4 border-white text-xl shadow-[0_8px_24px_-12px_rgba(11,42,91,0.55)]"
            />
            <div className="min-w-0 pb-1 pt-4 sm:pt-0">
              <h2 className="truncate font-display text-xl font-extrabold tracking-[-0.02em] text-navy">
                {displayName}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:translate-y-1.5 sm:pb-1">
            <button
              type="button"
              disabled={imageBusy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-navy/15 bg-white px-4 text-xs font-extrabold text-navy transition-colors hover:border-brand/35 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {imageBusy ? "Working…" : currentAvatar ? "Change photo" : "Add photo"}
            </button>
            {currentAvatar ? (
              <button
                type="button"
                disabled={imageBusy}
                onClick={removeImage}
                className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-55"
              >
                Remove
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={pickImage}
              className="hidden"
            />
          </div>
        </div>

        {imageError ? <p role="alert" className="mt-3 text-xs font-semibold text-danger-600">{imageError}</p> : null}

        <div className="my-6 h-px bg-navy/10" />

        <form onSubmit={saveName} className="grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-extrabold text-navy">Display name</span>
            <input
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoComplete="name"
              disabled={profileBusy}
              className="mt-2 min-h-12 w-full rounded-xl border border-navy/15 bg-white px-4 text-sm font-semibold text-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-haze"
              placeholder="Your name"
            />
          </label>

          <div>
            <span className="text-xs font-extrabold text-navy">Email address</span>
            <div className="mt-2 flex min-h-12 items-center rounded-xl border border-navy/10 bg-haze px-4 text-sm font-semibold text-navy/55">
              <span className="min-w-0 truncate">{email}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <button
              type="submit"
              disabled={profileBusy || draftName.trim() === savedName}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#2b8fe0] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {profileBusy ? "Saving…" : "Save changes"}
            </button>
            {createdAt ? (
              <span className="text-xs text-navy/42">
                Joined {formatDate(createdAt)}
              </span>
            ) : null}
            <span aria-live="polite" className={`text-xs font-semibold ${profileError ? "text-danger-600" : "text-success-600"}`}>
              {profileError ?? profileMessage}
            </span>
          </div>
        </form>
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
