/**
 * Finds unreferenced avatar, community, and flashcard uploads in the public
 * figures bucket. Dry-run is the default and every run is age-, scan-, and
 * deletion-bounded.
 *
 *   npx tsx scripts/storage/cleanup-user-uploads.ts
 *   npx tsx scripts/storage/cleanup-user-uploads.ts --older-than-days=30
 *   npx tsx scripts/storage/cleanup-user-uploads.ts --apply \
 *     --confirm=DELETE_ORPHANED_USER_UPLOADS --max-delete=100
 */
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "figures";
const MANAGED_PREFIXES = ["avatars", "community", "flashcards"] as const;
const PAGE_SIZE = 250;
const DEFAULT_MAX_SCAN = 5_000;
const DEFAULT_MAX_DELETE = 100;
const DEFAULT_AGE_DAYS = 30;
const APPLY_CONFIRMATION = "DELETE_ORPHANED_USER_UPLOADS";

type Args = {
  apply: boolean;
  confirmation: string | null;
  maxDelete: number;
  maxScan: number;
  olderThanDays: number;
};

type ObjectRow = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`Unsupported argument: ${arg}`);
    values.set(match[1], match[2]);
  }
  return {
    apply,
    confirmation: values.get("confirm") ?? null,
    maxDelete: positiveInteger(values.get("max-delete"), DEFAULT_MAX_DELETE),
    maxScan: positiveInteger(values.get("max-scan"), DEFAULT_MAX_SCAN),
    olderThanDays: positiveInteger(values.get("older-than-days"), DEFAULT_AGE_DAYS),
  };
}

function figurePath(value: unknown, supabaseOrigin: string): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.origin !== supabaseOrigin) return null;
    const marker = "/storage/v1/object/public/figures/";
    if (!url.pathname.startsWith(marker)) return null;
    const path = decodeURIComponent(url.pathname.slice(marker.length));
    return MANAGED_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`))
      ? path
      : null;
  } catch {
    return null;
  }
}

async function referencedPaths(db: SupabaseClient, supabaseOrigin: string): Promise<Set<string>> {
  const referenced = new Set<string>();
  const sources = [
    { table: "users", columns: ["avatar_url"] },
    { table: "community_posts", columns: ["image_url"] },
    { table: "flashcard_cards", columns: ["term_image_url", "definition_image_url"] },
  ] as const;

  for (const source of sources) {
    let offset = 0;
    while (true) {
      const result = await db
        .from(source.table)
        .select(source.columns.join(","))
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        for (const column of source.columns) {
          const path = figurePath(row[column], supabaseOrigin);
          if (path) referenced.add(path);
        }
      }
      if (rows.length < PAGE_SIZE) break;
      offset += rows.length;
      if (offset >= 100_000) {
        throw new Error(`Refusing cleanup: ${source.table} reference scan exceeded 100,000 rows`);
      }
    }
  }
  return referenced;
}

async function listedObjects(db: SupabaseClient, maxScan: number): Promise<{ objects: { path: string; timestamp: string }[]; truncated: boolean }> {
  const objects: { path: string; timestamp: string }[] = [];
  for (const prefix of MANAGED_PREFIXES) {
    let offset = 0;
    while (objects.length < maxScan) {
      const limit = Math.min(PAGE_SIZE, maxScan - objects.length);
      const result = await db.storage.from(BUCKET).list(prefix, {
        limit,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as ObjectRow[];
      for (const row of rows) {
        const timestamp = row.created_at ?? row.updated_at;
        if (row.name && timestamp) objects.push({ path: `${prefix}/${row.name}`, timestamp });
      }
      if (rows.length < limit) break;
      offset += rows.length;
    }
    if (objects.length >= maxScan) break;
  }
  return { objects, truncated: objects.length >= maxScan };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply && args.confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply mode requires --confirm=${APPLY_CONFIRMATION}`);
  }

  loadEnvConfig(process.cwd());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase admin environment is not configured");

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const references = await referencedPaths(db, supabaseOrigin);
  const listing = await listedObjects(db, args.maxScan);
  if (listing.truncated) {
    throw new Error(`Refusing cleanup: object scan reached --max-scan=${args.maxScan}`);
  }

  const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1_000;
  const eligible = listing.objects
    .filter((object) => !references.has(object.path) && Date.parse(object.timestamp) < cutoff)
    .map((object) => object.path);
  const candidates = eligible.slice(0, args.maxDelete);

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    scanned: listing.objects.length,
    referenced: references.size,
    eligible: eligible.length,
    selected: candidates.length,
    candidates,
    olderThanDays: args.olderThanDays,
    maxDelete: args.maxDelete,
  }));

  if (!args.apply || candidates.length === 0) return;
  const removed = await db.storage.from(BUCKET).remove(candidates);
  if (removed.error) throw removed.error;
  console.log(JSON.stringify({ removed: removed.data?.length ?? 0 }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Storage cleanup failed");
  process.exitCode = 1;
});
