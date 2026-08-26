"use client";

import { useState } from "react";

type Props = {
  src?: string | null;
  initials: string;
  alt?: string;
  className?: string;
};

export function Avatar({ src, initials, alt = "", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-navy font-display font-semibold text-white ${className}`}
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
