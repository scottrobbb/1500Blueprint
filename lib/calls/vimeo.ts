// Converts a vimeo.com watch link (or an already-embeddable player.vimeo.com
// link) into the player.vimeo.com URL an <iframe> can embed. Handles the
// unlisted-video hash Vimeo appends as a second path segment.
export function vimeoEmbedUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.hostname === "player.vimeo.com" && parsed.pathname.startsWith("/video/")) {
    return parsed.toString();
  }

  if (!parsed.hostname.endsWith("vimeo.com")) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const videoId = segments.find((segment) => /^\d+$/.test(segment));
  if (!videoId) return null;
  const hash = segments.find((segment) => segment !== videoId && /^[a-zA-Z0-9]+$/.test(segment));

  const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
  if (hash) embed.searchParams.set("h", hash);
  return embed.toString();
}
