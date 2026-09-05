import { isAuthorizedCron } from "@/lib/security/cron";
import { deliverConversions } from "@/lib/marketing/delivery";
import { reportServerError } from "@/lib/observability/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await deliverConversions(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    reportServerError("marketing.conversion.retry_failed", error, { provider: "supabase" });
    return Response.json({ error: "Conversion delivery is unavailable" }, { status: 503 });
  }
}
