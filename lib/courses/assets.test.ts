import assert from "node:assert/strict";
import test from "node:test";
import { courseAssetReferences, rewriteCourseAssetReferences } from "./assets";

const SUPABASE_URL = "https://project.supabase.co";

test("course asset references recognize only this project's private bucket", () => {
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/course-assets/lessons/unit%201.pdf`;
  const signedUrl = `${SUPABASE_URL}/storage/v1/object/sign/course-assets/images/diagram.png?token=secret`;
  const references = courseAssetReferences(
    { publicUrl, explanation: `Listen: [[audio:${signedUrl}]]`, external: "https://example.com/file.pdf" },
    SUPABASE_URL,
  );

  assert.deepEqual(references, [
    { source: publicUrl, path: "lessons/unit 1.pdf" },
    { source: signedUrl, path: "images/diagram.png" },
  ]);
});

test("course asset references can be replaced recursively without changing other links", () => {
  const stored = `${SUPABASE_URL}/storage/v1/object/public/course-assets/lessons/notes.pdf`;
  const signed = `${SUPABASE_URL}/storage/v1/object/sign/course-assets/lessons/notes.pdf?token=new`;
  const content = { url: stored, nested: [`Download ${stored}`, "https://example.com/public"] };

  assert.deepEqual(rewriteCourseAssetReferences(content, new Map([[stored, signed]])), {
    url: signed,
    nested: [`Download ${signed}`, "https://example.com/public"],
  });
});
