import "server-only";

import { reportServerError } from "@/lib/observability/server";
import {
  reconcileContactImports,
  seedEligibleStudentContacts,
  startPendingContactImport,
} from "./audience";
import { processPendingEmailCampaigns, queueMissingLiveCallEmails } from "./campaigns";

export type EmailWorkSummary = {
  seededContacts: number;
  reconciledImports: number;
  startedImport: boolean;
  queuedCampaigns: number;
  processedCampaigns: number;
  failures: string[];
};

export async function processEmailWork(): Promise<EmailWorkSummary> {
  const summary: EmailWorkSummary = {
    seededContacts: 0,
    reconciledImports: 0,
    startedImport: false,
    queuedCampaigns: 0,
    processedCampaigns: 0,
    failures: [],
  };
  summary.seededContacts = await run("seed_contacts", () => seedEligibleStudentContacts(), summary, 0);
  summary.reconciledImports = await run("reconcile_imports", () => reconcileContactImports(), summary, 0);
  summary.startedImport = Boolean(await run("start_import", () => startPendingContactImport(), summary, null));
  summary.queuedCampaigns = await run("queue_campaigns", () => queueMissingLiveCallEmails(), summary, 0);
  summary.processedCampaigns = await run("process_campaigns", () => processPendingEmailCampaigns(), summary, 0);
  return summary;
}

async function run<T>(
  name: string,
  operation: () => Promise<T>,
  summary: EmailWorkSummary,
  fallback: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    summary.failures.push(name);
    reportServerError("email.processor.step_failed", error, {
      provider: name.includes("campaign") || name.includes("import") ? "resend" : "supabase",
      source: name,
    });
    return fallback;
  }
}
