import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { validateProfileName } from "@/lib/settings/profile-name";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown }
    | null;
  const validation = validateProfileName(body?.name);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error, message: validation.message },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  if (session.userId) {
    const { data: authData, error: authReadError } =
      await admin.auth.admin.getUserById(session.userId);
    if (authReadError || !authData.user) {
      return NextResponse.json(
        { error: "auth_profile_unavailable" },
        { status: 502 },
      );
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      session.userId,
      {
        user_metadata: {
          ...authData.user.user_metadata,
          display_name: validation.name,
        },
      },
    );
    if (authUpdateError) {
      return NextResponse.json(
        { error: "auth_profile_update_failed" },
        { status: 502 },
      );
    }
  }

  const { data, error } = await admin
    .from("users")
    .update({
      name: validation.name,
      updated_at: new Date().toISOString(),
    })
    .eq("email", session.email)
    .select("name")
    .maybeSingle<{ name: string }>();

  if (error) {
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }

  return NextResponse.json({ name: data.name });
}
