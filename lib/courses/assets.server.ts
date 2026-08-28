import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { courseAssetReferences, rewriteCourseAssetReferences } from "./assets";

const SIGNED_ASSET_TTL_SECONDS = 4 * 60 * 60;

export async function signCourseAssetReferences<T>(value: T, strict = false): Promise<T> {
  const references = courseAssetReferences(value, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const paths = [...new Set(references.map((reference) => reference.path))];
  if (paths.length === 0) return value;

  const result = await supabaseAdmin()
    .storage
    .from("course-assets")
    .createSignedUrls(paths, SIGNED_ASSET_TTL_SECONDS);
  if (result.error) {
    if (strict) throw result.error;
    return value;
  }

  const byPath = new Map(
    result.data.flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []),
  );
  const replacements = new Map(
    references.flatMap((reference) => {
      const signedUrl = byPath.get(reference.path);
      return signedUrl ? [[reference.source, signedUrl] as const] : [];
    }),
  );
  return rewriteCourseAssetReferences(value, replacements);
}

export function canonicalizeCourseAssetReferences<T>(value: T): T {
  const references = courseAssetReferences(value, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (references.length === 0) return value;
  const bucket = supabaseAdmin().storage.from("course-assets");
  const replacements = new Map(
    references.map((reference) => [
      reference.source,
      bucket.getPublicUrl(reference.path).data.publicUrl,
    ]),
  );
  return rewriteCourseAssetReferences(value, replacements);
}
