import { WEEK_PASS_AMOUNT } from "./offers";

export type WeekPassPayment = {
  mode: string | null;
  status: string | null;
  payment_status: string;
  livemode: boolean;
  currency: string | null;
  amount_total: number | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
};

export function validateWeekPassPayment(session: WeekPassPayment, livemode: boolean): string {
  const owner = session.client_reference_id;
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid"
    || session.livemode !== livemode || session.currency !== "usd" || session.amount_total !== WEEK_PASS_AMOUNT
    || !owner || session.metadata?.user_id !== owner || session.metadata.platform !== "1500_blueprint"
    || session.metadata.plan_code !== "max" || session.metadata.billing_cadence !== "one_week") {
    throw new Error("Invalid or unpaid one-week Max purchase");
  }
  return owner;
}

export function weekPassIsActive(pass: { starts_at: string; expires_at: string; refunded_at: string | null }, now = new Date()): boolean {
  return !pass.refunded_at && Date.parse(pass.starts_at) <= now.getTime() && Date.parse(pass.expires_at) > now.getTime();
}
