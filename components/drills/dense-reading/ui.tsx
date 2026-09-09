"use client";
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { primaryBtn, secondaryBtn } from "../shared/ui";

export const surface = "rounded-xl border border-navy/15 bg-white";
export const field =
  "min-h-11 w-full rounded-lg border border-navy/20 bg-white px-3 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand";
export function ReadingButton({
  secondary = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`${secondary ? secondaryBtn : primaryBtn} min-h-11 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    />
  );
}
export function ReadingDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-navy/15 bg-white p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-navy">{title}</h2>
          <ReadingButton
            secondary
            onClick={onClose}
            aria-label="Close dialog"
            className="px-3"
          >
            Close
          </ReadingButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
