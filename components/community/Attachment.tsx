import type { PostShot } from "@/lib/community/types";

export function Attachment({ shot, variant }: { shot: PostShot; variant: "thumb" | "full" }) {
  if (variant === "thumb") {
    return (
      <div className="h-20 w-20 flex-none overflow-hidden rounded-[10px] border border-navy/12 bg-haze">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.url} alt={shot.alt} width={320} height={320} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="mt-3 w-full overflow-hidden rounded-[14px] border border-navy/12 bg-haze">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt={shot.alt} width={1200} height={800} loading="lazy" className="block h-auto max-h-[520px] w-full object-contain" />
    </div>
  );
}
