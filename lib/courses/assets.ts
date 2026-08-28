export type CourseAssetReference = { source: string; path: string };

const COURSE_ASSET_MARKERS = [
  "/storage/v1/object/public/course-assets/",
  "/storage/v1/object/sign/course-assets/",
] as const;

export function courseAssetReferences(
  value: unknown,
  supabaseUrl: string | undefined,
): CourseAssetReference[] {
  if (!supabaseUrl) return [];

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(supabaseUrl).origin;
  } catch {
    return [];
  }

  const candidates = new Set<string>();
  collectStrings(value, (text) => {
    for (const candidate of text.match(/https?:\/\/[^\s<>"'\[\]()]+/g) ?? []) {
      candidates.add(candidate);
    }
  });

  return [...candidates].flatMap((source) => {
    try {
      const url = new URL(source);
      if (url.origin !== expectedOrigin) return [];
      const marker = COURSE_ASSET_MARKERS.find((item) => url.pathname.includes(item));
      if (!marker) return [];
      const encodedPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
      if (!encodedPath) return [];
      return [{ source, path: decodeURIComponent(encodedPath) }];
    } catch {
      return [];
    }
  });
}

export function rewriteCourseAssetReferences<T>(
  value: T,
  replacements: ReadonlyMap<string, string>,
): T {
  if (typeof value === "string") {
    let rewritten: string = value;
    for (const [source, replacement] of replacements) {
      rewritten = rewritten.replaceAll(source, replacement);
    }
    return rewritten as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteCourseAssetReferences(item, replacements)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteCourseAssetReferences(item, replacements)]),
    ) as T;
  }
  return value;
}

function collectStrings(value: unknown, visit: (value: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, visit));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, visit));
  }
}
