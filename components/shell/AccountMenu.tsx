"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";

type Props = {
  name: string;
  initials: string;
  level: number;
  plan: string;
  avatarUrl: string | null;
  wide?: boolean;
  tone?: "light" | "dark";
  test?: boolean;
  billing?: boolean;
};

// The nav avatar: clicking it opens a small menu with profile-photo controls and
// the sign-out action (a plain form POST to the logout route).
export function AccountMenu({ name, initials, level, plan, avatarUrl, wide = false, tone = "light", test = false, billing = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!file) return;
    setError(null);
    setOpen(false); // hand off to the cropper modal
    setPending(file);
  }

  async function uploadBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", blob, "avatar.jpg");
    const res = await fetch("/api/profile/avatar", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setError("Upload failed. Use an image under 5 MB.");
      return; // keep the cropper open so they can retry
    }
    setPending(null);
    router.refresh();
  }

  async function removePhoto() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not remove. Please try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className={wide ? "relative min-w-0 flex-1" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account menu"
        className={wide
          ? `flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${tone === "dark" ? "hover:bg-white/[0.07] focus-visible:outline-sky" : "hover:bg-navy/[0.045] focus-visible:outline-brand"}`
          : "inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"}
      >
        <Avatar src={avatarUrl} initials={initials} alt={name} className={wide ? `h-10 w-10 flex-none border-2 text-[13px] ${tone === "dark" ? "border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" : "border-white shadow-[0_0_0_1px_rgba(11,42,91,0.15)]"}` : "h-[34px] w-[34px] border-2 border-white text-[13px] shadow-[0_0_0_1px_rgba(11,42,91,0.15)]"} />
        {wide ? <><span className="min-w-0 flex-1"><strong className={`block truncate text-xs font-extrabold ${tone === "dark" ? "text-white/90" : "text-navy"}`}>{name}</strong><span className="mt-1 inline-flex rounded-full bg-gold px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white shadow-sm">{plan}{test ? " · Test" : ""}</span></span><ChevronIcon className={`h-4 w-4 flex-none transition-transform duration-200 motion-reduce:transition-none ${tone === "dark" ? "text-white/40" : "text-navy/35"} ${open ? "rotate-180" : ""}`} /></> : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close account dialog"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 cursor-default bg-navy/30 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your account"
            className="fixed left-1/2 top-1/2 z-[60] w-[min(calc(100vw-2rem),360px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] border border-navy/12 bg-white shadow-[0_28px_80px_-28px_rgba(11,42,91,0.65)]"
          >
            <div className="relative flex items-center gap-4 border-b border-navy/10 px-5 py-5">
              <Avatar src={avatarUrl} initials={initials} alt={name} className="h-12 w-12 flex-none text-sm" />
              <div className="min-w-0 pr-9">
                <div className="truncate font-display text-lg font-extrabold text-navy">{name}</div>
                <div className="mt-1 text-sm font-medium text-navy/50">
                  Level {level} · {plan}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close account dialog" className="absolute right-3 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-navy/40 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><CloseIcon className="h-5 w-5" /></button>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-navy/70 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:bg-navy/5 focus-visible:outline-none disabled:opacity-50"
            >
              <PhotoIcon className="h-4 w-4" /> {busy ? "Working…" : avatarUrl ? "Change photo" : "Add photo"}
            </button>
            {avatarUrl && !busy && (
              <button
                type="button"
                onClick={removePhoto}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-navy/70 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:bg-navy/5 focus-visible:outline-none"
              >
                <RemovePhotoIcon className="h-4 w-4" /> Remove photo
              </button>
            )}
            {error && <p className="px-4 py-2 text-xs font-medium text-danger-600">{error}</p>}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={onPick}
              className="hidden"
            />

            {billing ? (
              <form action="/api/billing/portal" method="post" className="border-t border-navy/10">
                <button
                  type="submit"
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-navy/70 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:bg-navy/5 focus-visible:outline-none"
                >
                  <BillingIcon className="h-4 w-4" /> Manage billing
                </button>
              </form>
            ) : null}

            <form action="https://www.1500satblueprint.com/api/auth/logout" method="post" className="border-t border-navy/10">
              <button
                type="submit"
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-bold text-red-700 transition-colors duration-200 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
              >
                <SignOutIcon className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </>,
        document.body,
      ) : null}

      {pending && (
        <AvatarCropper
          file={pending}
          busy={busy}
          error={error}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          onSave={uploadBlob}
        />
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PhotoIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2.5" /><circle cx="9" cy="11" r="2" /><path d="m5 18 4.5-4 3.5 3 2.5-2 3.5 3" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function RemovePhotoIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 8.5 7 7" strokeLinecap="round" /></svg>; }
function BillingIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 9h18M7 15h4" strokeLinecap="round" /></svg>; }
function SignOutIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>; }
