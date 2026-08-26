"use client";

import { useState } from "react";

export function Avatar({
  initials,
  size = 40,
  src,
  alt = "",
  level,
}: {
  initials: string;
  size?: number;
  src?: string | null;
  alt?: string;
  level?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const badgeSize = Math.max(16, Math.round(size * 0.4));

  return (
    <span className="relative inline-flex flex-none" style={{ height: size, width: size }}>
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-navy font-display font-semibold text-white"
        style={{ fontSize: Math.round(size * 0.36) }}
        aria-hidden={showImage ? undefined : true}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src as string}
            alt={alt}
            width={size}
            height={size}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          initials
        )}
      </span>
      {level != null && size >= 32 && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-navy font-display font-extrabold text-white ring-2 ring-white"
          style={{ height: badgeSize, width: badgeSize, fontSize: Math.max(9, Math.round(size * 0.16)) }}
        >
          {level}
        </span>
      )}
    </span>
  );
}
