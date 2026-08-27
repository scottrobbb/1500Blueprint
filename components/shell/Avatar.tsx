"use client";

import { useState } from "react";

type Props = {
  src?: string | null;
  initials: string;
  alt?: string;
  // Sizing / border classes from the caller (e.g. "h-9 w-9 text-xs").
  className?: string;
};

// A user's avatar: their uploaded photo when set, otherwise their initials on
// the brand gradient. Falls back to initials if the image fails to load, so a
// broken or deleted URL never shows a broken-image icon.
export function Avatar({ src, initials, alt = "", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#3fa9f5,#0b2a5b)] font-display font-extrabold text-white ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          width={96}
          height={96}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}
