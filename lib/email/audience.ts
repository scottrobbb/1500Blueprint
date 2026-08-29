import "server-only";

import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { resendManagementClient } from "./client";
import { resendBroadcastConfig } from "./config";

type StudentRow = {
  id: string;
  email: string;
  name: string | null;
  account_status: string;
  is_test_account: boolean;
};

type PendingContact = {
  email: string;
  user_id: string;
};

type ContactImportRow = {
  resend_import_id: string;
  status: string;
};

export async function queueStudentContact(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const account = await loadStudent(normalizedEmail);
  if (!account) return;
  const result = await supabaseAdmin().from("email_contacts").upsert({
    email: normalizedEmail,
    user_id: account.id,
    sync_status: eligible(account) ? "pending" : "removed",
    last_error_code: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "email" });
  if (result.error) throw new Error(`failed to queue student contact: ${result.error.message}`);
}

export async function syncStudentContact(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const config = resendBroadcastConfig();
  if (!config) {
    await markContact(normalizedEmail, "failed", "broadcast_config_missing");
    return;
  }

  const account = await loadStudent(normalizedEmail);
  if (!account) return;
  const localState = await supabaseAdmin().from("email_contacts")
    .select("delivery_status")
    .eq("email", normalizedEmail)
    .maybeSingle<{ delivery_status: string }>();
  if (localState.error) throw localState.error;
  if (localState.data?.delivery_status && localState.data.delivery_status !== "active") {
    await markContact(normalizedEmail, "failed", "recipient_suppressed");
    return;
  }

  try {
    const existing = await resendManagementClient().contacts.get({ email: normalizedEmail });
    if (!eligible(account)) {
      if (existing.data) {
        const removed = await resendManagementClient().contacts.segments.remove({
          email: normalizedEmail,
          segmentId: config.segmentId,
        });
        if (removed.error && removed.error.statusCode !== 404) throw removed.error;
      }
      await markContact(normalizedEmail, "removed", null);
      return;
    }

    const names = splitName(account.name);
    let contactId = existing.data?.id ?? null;
    if (existing.error && existing.error.statusCode !== 404) throw existing.error;

    if (contactId) {
      const updated = await resendManagementClient().contacts.update({
        email: normalizedEmail,
        firstName: names.firstName,
        lastName: names.lastName,
      });
      if (updated.error) throw updated.error;
      const segment = await resendManagementClient().contacts.segments.add({
        email: normalizedEmail,
        segmentId: config.segmentId,
      });
      if (segment.error) throw segment.error;
    } else {
      const created = await resendManagementClient().contacts.create({
        email: normalizedEmail,
        firstName: names.firstName ?? undefined,
        lastName: names.lastName ?? undefined,
        unsubscribed: false,
        segments: [{ id: config.segmentId }],
      });
      if (created.error || !created.data) throw created.error ?? new Error("Resend did not return a contact");
      contactId = created.data.id;
    }

    const result = await supabaseAdmin().from("email_contacts").upsert({
      email: normalizedEmail,
      user_id: account.id,
      resend_contact_id: contactId,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (result.error) throw result.error;
  } catch (error) {
    const code = errorCode(error);
    await markContact(normalizedEmail, "failed", code);
    reportServerError("email.contact.sync_failed", error, { provider: "resend", source: "syncStudentContact" });
  }
}

export async function seedEligibleStudentContacts(): Promise<number> {
  const rows: { email: string; user_id: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabaseAdmin()
      .from("users")
      .select("id,email")
      .eq("account_status", "active")
      .eq("is_test_account", false)
      .order("email")
      .range(offset, offset + 999)
      .returns<{ id: string; email: string }[]>();
    if (result.error) throw new Error(`failed to load student contacts: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page.map((row) => ({ email: row.email, user_id: row.id })));
    if (page.length < 1000) break;
  }
  if (!rows.length) return 0;
  const result = await supabaseAdmin().from("email_contacts").upsert(rows, {
    onConflict: "email",
    ignoreDuplicates: true,
  });
  if (result.error) throw new Error(`failed to seed email contacts: ${result.error.message}`);
  return rows.length;
}

export async function startPendingContactImport(limit = 1000): Promise<string | null> {
  const config = resendBroadcastConfig();
  if (!config) return null;
  const pending = await supabaseAdmin()
    .from("email_contacts")
    .select("email,user_id")
    .in("sync_status", ["pending", "failed"])
    .eq("delivery_status", "active")
    .order("updated_at")
    .limit(Math.max(1, Math.min(limit, 5000)))
    .returns<PendingContact[]>();
  if (pending.error) throw new Error(`failed to load pending email contacts: ${pending.error.message}`);
  if (!pending.data?.length) return null;

  const users = await loadStudents(pending.data.map((row) => row.email));
  const csvRows = [["Email", "First Name", "Last Name"]];
  for (const row of pending.data) {
    const account = users.get(row.email);
    if (!account || !eligible(account)) continue;
    const names = splitName(account.name);
    csvRows.push([row.email, names.firstName ?? "", names.lastName ?? ""]);
  }
  if (csvRows.length === 1) return null;

  const claimId = `claim-${crypto.randomUUID()}`;
  const candidateEmails = csvRows.slice(1).map((row) => row[0]);
  const claimed = await supabaseAdmin().from("email_contacts").update({
    sync_status: "syncing",
    resend_import_id: claimId,
    last_error_code: null,
    updated_at: new Date().toISOString(),
  }).in("email", candidateEmails).in("sync_status", ["pending", "failed"]).select("email").returns<{ email: string }[]>();
  if (claimed.error) throw claimed.error;
  const claimedEmails = new Set((claimed.data ?? []).map((row) => row.email));
  if (!claimedEmails.size) return null;
  const claimedRows = [csvRows[0], ...csvRows.slice(1).filter((row) => claimedEmails.has(row[0]))];
  const csv = claimedRows.map((row) => row.map(csvCell).join(",")).join("\n");

  let importId: string;
  try {
    const imported = await resendManagementClient().contacts.imports.create({
      file: new Blob([csv], { type: "text/csv" }),
      columnMap: { email: "Email", firstName: "First Name", lastName: "Last Name" },
      onConflict: "upsert",
      segments: [{ id: config.segmentId }],
    });
    if (imported.error || !imported.data) throw imported.error ?? new Error("Resend did not create the contact import");
    importId = imported.data.id;
  } catch (error) {
    await supabaseAdmin().from("email_contacts").update({
      sync_status: "failed",
      resend_import_id: null,
      last_error_code: errorCode(error),
      updated_at: new Date().toISOString(),
    }).eq("resend_import_id", claimId);
    throw error;
  }

  const emails = [...claimedEmails];
  const [tracking, contacts] = await Promise.all([
    supabaseAdmin().from("email_contact_imports").upsert({
      resend_import_id: importId,
      status: "queued",
      total_count: emails.length,
      updated_at: new Date().toISOString(),
    }, { onConflict: "resend_import_id" }),
    supabaseAdmin().from("email_contacts").update({
      resend_import_id: importId,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }).eq("resend_import_id", claimId),
  ]);
  if (tracking.error || contacts.error) throw tracking.error ?? contacts.error;
  return importId;
}

export async function reconcileContactImports(): Promise<number> {
  const result = await supabaseAdmin()
    .from("email_contact_imports")
    .select("resend_import_id,status")
    .in("status", ["queued", "in_progress"])
    .order("created_at")
    .limit(20)
    .returns<ContactImportRow[]>();
  if (result.error) throw new Error(`failed to load contact imports: ${result.error.message}`);

  let reconciled = 0;
  for (const row of result.data ?? []) {
    const remote = await resendManagementClient().contacts.imports.get(row.resend_import_id);
    if (remote.error || !remote.data) {
      await noteImportError(row.resend_import_id, errorCode(remote.error));
      continue;
    }
    const counts = remote.data.counts;
    const complete = remote.data.status === "completed";
    const failed = remote.data.status === "failed";
    const update = await supabaseAdmin().from("email_contact_imports").update({
      status: remote.data.status,
      total_count: counts.total,
      created_count: counts.created,
      updated_count: counts.updated,
      skipped_count: counts.skipped,
      failed_count: counts.failed,
      completed_at: remote.data.completed_at,
      last_error_code: failed ? "contact_import_failed" : null,
      updated_at: new Date().toISOString(),
    }).eq("resend_import_id", row.resend_import_id);
    if (update.error) throw update.error;

    if (complete || failed) {
      const contactUpdate = await supabaseAdmin().from("email_contacts").update({
        sync_status: complete && counts.failed === 0 ? "synced" : "failed",
        last_synced_at: complete ? new Date().toISOString() : null,
        last_error_code: complete && counts.failed === 0 ? null : "contact_import_partial_failure",
        updated_at: new Date().toISOString(),
      }).eq("resend_import_id", row.resend_import_id);
      if (contactUpdate.error) throw contactUpdate.error;
      reconciled += 1;
    }
  }
  return reconciled;
}

async function loadStudent(email: string): Promise<StudentRow | null> {
  const result = await supabaseAdmin()
    .from("users")
    .select("id,email,name,account_status,is_test_account")
    .eq("email", email)
    .maybeSingle<StudentRow>();
  if (result.error) throw new Error(`failed to load student contact: ${result.error.message}`);
  return result.data;
}

async function loadStudents(emails: string[]): Promise<Map<string, StudentRow>> {
  const rows: StudentRow[] = [];
  for (let index = 0; index < emails.length; index += 100) {
    const result = await supabaseAdmin()
      .from("users")
      .select("id,email,name,account_status,is_test_account")
      .in("email", emails.slice(index, index + 100))
      .returns<StudentRow[]>();
    if (result.error) throw new Error(`failed to load student contact batch: ${result.error.message}`);
    rows.push(...(result.data ?? []));
  }
  return new Map(rows.map((row) => [row.email, row]));
}

function eligible(account: StudentRow): boolean {
  return account.account_status === "active" && !account.is_test_account;
}

function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function markContact(email: string, status: string, error: string | null): Promise<void> {
  const result = await supabaseAdmin().from("email_contacts").update({
    sync_status: status,
    last_error_code: error,
    updated_at: new Date().toISOString(),
  }).eq("email", email);
  if (result.error) reportServerError("email.contact.state_failed", result.error, { provider: "supabase", source: "markContact" });
}

async function noteImportError(importId: string, code: string): Promise<void> {
  const result = await supabaseAdmin().from("email_contact_imports").update({
    last_error_code: code,
    updated_at: new Date().toISOString(),
  }).eq("resend_import_id", importId);
  if (result.error) reportServerError("email.contact_import.state_failed", result.error, { provider: "supabase", source: "reconcileContactImports" });
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && /^[a-z0-9_-]{1,80}$/i.test(name) ? name : "unknown_error";
}
