import { processEmailWork } from "@/lib/email/processor";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await processEmailWork();
  return Response.json({ ok: summary.failures.length === 0, ...summary }, {
    status: summary.failures.length === 0 ? 200 : 500,
  });
}
