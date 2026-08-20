import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type PasswordIdentity = {
  userId: string;
  email: string;
};

// Refreshes the Supabase auth session on each request and keeps cookies in sync.
// (Next 16 renamed Middleware → Proxy; wired from the root proxy.ts.)
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  identity: PasswordIdentity | null;
}> {
  let supabaseResponse = NextResponse.next({ request });

  if (!supabaseUrl || !supabaseKey) {
    return { response: supabaseResponse, identity: null };
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  const userId = data?.claims.sub;
  const identity =
    !error && typeof email === "string" && typeof userId === "string"
      ? { email: email.trim().toLowerCase(), userId }
      : null;

  return { response: supabaseResponse, identity };
}
