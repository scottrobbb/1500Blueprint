// Shared Vimeo-link detection for explanation authoring (paste handlers) and
// rendering (ExplanationText). A single source of truth for the URL shape so
// the two stay in sync.

const VIMEO_ID_RE = /vimeo\.com\/(?:video\/)?(\d+)/i;
const BARE_VIMEO_URL_RE = /^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?\d+(?:[/?][^\s]*)?$/i;

export function extractVimeoId(url: string): string | null {
  return url.match(VIMEO_ID_RE)?.[1] ?? null;
}

// True when the pasted text is nothing but a Vimeo link (so a paste of a
// paragraph that happens to mention a Vimeo URL isn't auto-wrapped).
export function isBareVimeoUrl(text: string): boolean {
  return BARE_VIMEO_URL_RE.test(text.trim());
}
