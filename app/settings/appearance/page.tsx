import { cookies } from "next/headers";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme/theme";

export default async function AppearancePage() {
  // Settings is already a dynamic, signed-in route, so reading the cookie here
  // costs nothing and lets the switch render in the right position on the
  // server. The root layout deliberately does not read it — that would opt the
  // static marketing pages out of prerendering.
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <SettingsPageHeading title="Appearance" />
      <AppearanceSettings initialTheme={theme} />
    </>
  );
}
