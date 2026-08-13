import type { CommenterAvatar } from "@/lib/community/types";
import { Avatar } from "./Avatar";

// Overlapping small avatars for the feed card footer ("who's been commenting").
// Renders nothing for an empty/absent list, so callers can spread it in freely.
export function AvatarStack({ items, size = 22 }: { items: CommenterAvatar[]; size?: number }) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-center">
      {items.map((it, i) => (
        <span key={i} className="rounded-full ring-2 ring-white" style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar initials={it.initials} src={it.avatarUrl} size={size} />
        </span>
      ))}
    </div>
  );
}
