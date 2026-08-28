// Server-only data layer for flashcard sets. Uses the service-role key
// (supabaseAdmin) which bypasses RLS, so callers MUST authorize first
// (getSession / ownership checks) — never import this into a Client Component.

import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { reportServerError } from "@/lib/observability/server";
import type {
  CardInput,
  FlashcardCard,
  FlashcardSet,
  FlashcardSetWithCards,
  SetInput,
  SetVisibility,
} from "./types";

const SET_COLUMNS =
  "id, owner_email, title, description, visibility, created_at, updated_at";

type SetRow = {
  id: string;
  owner_email: string;
  title: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  flashcard_cards?: { count: number }[] | null;
};

type CardRow = {
  id: string;
  position: number;
  term: string;
  definition: string;
  term_image_url: string | null;
  definition_image_url: string | null;
};

function toVisibility(value: string): SetVisibility {
  return value === "shared" ? "shared" : "private";
}

function mapSet(row: SetRow): FlashcardSet {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    title: row.title,
    description: row.description,
    visibility: toVisibility(row.visibility),
    cardCount: row.flashcard_cards?.[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCard(row: CardRow): FlashcardCard {
  return {
    id: row.id,
    position: row.position,
    term: row.term,
    definition: row.definition,
    termImageUrl: row.term_image_url ?? null,
    definitionImageUrl: row.definition_image_url ?? null,
  };
}

type CardInsert = {
  position: number;
  term: string;
  definition: string;
  term_image_url: string | null;
  definition_image_url: string | null;
};

// Drop blank rows (a row counts as content if it has text OR an image on either
// side), trim, and renumber positions 1..n.
function cleanCards(cards: CardInput[]): CardInsert[] {
  return cards
    .map((c) => ({
      term: c.term.trim(),
      definition: c.definition.trim(),
      term_image_url: c.termImageUrl ?? null,
      definition_image_url: c.definitionImageUrl ?? null,
    }))
    .filter(
      (c) => c.term !== "" || c.definition !== "" || c.term_image_url || c.definition_image_url,
    )
    .map((c, i) => ({ position: i + 1, ...c }));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// A student's library: their own sets + every admin-shared set (minus any they
// own, so a set never appears twice).
export async function listStudentLibrary(
  email: string,
): Promise<{ owned: FlashcardSet[]; shared: FlashcardSet[] }> {
  const db = supabaseAdmin();
  const select = `${SET_COLUMNS}, flashcard_cards(count)`;

  const [ownedRes, sharedRes] = await Promise.all([
    db
      .from("flashcard_sets")
      .select(select)
      .eq("owner_email", email)
      .order("updated_at", { ascending: false }),
    db
      .from("flashcard_sets")
      .select(select)
      .eq("visibility", "shared")
      .neq("owner_email", email)
      .order("updated_at", { ascending: false }),
  ]);

  const owned = (ownedRes.data as SetRow[] | null)?.map(mapSet) ?? [];
  const shared = (sharedRes.data as SetRow[] | null)?.map(mapSet) ?? [];
  return { owned, shared };
}

// Every set, newest first — admin roster view.
export async function listAllSets(): Promise<FlashcardSet[]> {
  const { data } = await supabaseAdmin()
    .from("flashcard_sets")
    .select(`${SET_COLUMNS}, flashcard_cards(count)`)
    .order("updated_at", { ascending: false });
  return (data as SetRow[] | null)?.map(mapSet) ?? [];
}

// A single set with its cards, but only if the viewer is allowed to see it
// (owner, an admin, or the set is shared). Returns null otherwise.
export async function getSetForViewer(
  id: string,
  email: string,
): Promise<FlashcardSetWithCards | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("flashcard_sets").select(SET_COLUMNS).eq("id", id).maybeSingle();
  const row = data as SetRow | null;
  if (!row) return null;

  const visible =
    row.owner_email === email || row.visibility === "shared" || isAdminEmail(email);
  if (!visible) return null;

  const cardRows: CardRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: cardData, error } = await db
      .from("flashcard_cards")
      .select("id, position, term, definition, term_image_url, definition_image_url")
      .eq("set_id", id)
      .order("position", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return null;
    const page = (cardData as CardRow[] | null) ?? [];
    cardRows.push(...page);
    if (page.length < pageSize) break;
  }

  const cards = cardRows.map(mapCard);
  return { ...mapSet(row), cards };
}

// True if the email may edit/delete the set (its owner, or any admin).
export async function canEditSet(id: string, email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const { data } = await supabaseAdmin()
    .from("flashcard_sets")
    .select("owner_email")
    .eq("id", id)
    .maybeSingle();
  return (data as { owner_email: string } | null)?.owner_email === email;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createSet(ownerEmail: string, input: SetInput): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("flashcard_sets")
    .insert({
      owner_email: ownerEmail,
      title: input.title.trim() || "Untitled set",
      description: input.description?.trim() || null,
      visibility: input.visibility,
    })
    .select("id")
    .single();
  if (error || !data) return null;

  const id = (data as { id: string }).id;
  // If the cards fail to insert, roll back the set so we never leave an empty
  // shell behind — and the caller reports a clean failure instead of "success".
  if (!(await insertCards(id, input.cards))) {
    await db.from("flashcard_sets").delete().eq("id", id);
    return null;
  }
  return id;
}

export async function updateSet(id: string, input: SetInput): Promise<boolean> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("flashcard_sets")
    .update({
      title: input.title.trim() || "Untitled set",
      description: input.description?.trim() || null,
      visibility: input.visibility,
    })
    .eq("id", id);
  if (error) return false;
  return replaceCards(id, input.cards);
}

export async function deleteSet(id: string): Promise<void> {
  await supabaseAdmin().from("flashcard_sets").delete().eq("id", id); // cards cascade
}

// Cascade-replace the card list (mirrors replaceWalkthrough in admin-queries).
// Returns false if the re-insert fails so the caller can surface the error.
async function replaceCards(setId: string, cards: CardInput[]): Promise<boolean> {
  await supabaseAdmin().from("flashcard_cards").delete().eq("set_id", setId);
  return insertCards(setId, cards);
}

async function insertCards(setId: string, cards: CardInput[]): Promise<boolean> {
  const rows = cleanCards(cards).map((c) => ({ set_id: setId, ...c }));
  if (rows.length === 0) return true;
  const { error } = await supabaseAdmin().from("flashcard_cards").insert(rows);
  if (error) {
    reportServerError("flashcards.cards_insert_failed", error, {
      provider: "supabase",
      source: "insert-cards",
    });
    return false;
  }
  return true;
}
