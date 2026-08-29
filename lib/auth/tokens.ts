import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { TOKEN_TTL_SECONDS } from "./config";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Create a single-use magic-link token for an email. Returns the RAW token to
// embed in the emailed link; only its hash is stored.
export async function createLoginToken(
  email: string,
  plan: string | null,
): Promise<{ id: string; raw: string }> {
  const id = randomUUID();
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabaseAdmin().from("login_tokens").insert({
    id,
    email,
    token_hash: hashToken(raw),
    plan,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`failed to store login token: ${error.message}`);
  return { id, raw };
}

// Consume a raw token if it's valid (exists, unexpired, unused). Atomically
// claims it so a double-click can't log in twice. Returns the email + plan.
export async function consumeLoginToken(
  raw: string,
): Promise<{ email: string; plan: string | null } | null> {
  const tokenHash = hashToken(raw);
  const { data, error } = await supabaseAdmin()
    .from("login_tokens")
    .select("id,email,plan,expires_at,consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.consumed_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  // Claim it; if another request already did, we get back zero rows.
  const { data: claimed, error: claimError } = await supabaseAdmin()
    .from("login_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("consumed_at", null)
    .select("id");

  if (claimError || !claimed || claimed.length === 0) return null;
  return { email: data.email as string, plan: (data.plan as string | null) ?? null };
}
