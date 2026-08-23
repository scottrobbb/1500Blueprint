export type ComplimentaryAccountFacts = {
  legacyPlan: string | null | undefined;
  isTestAccount: boolean;
  activeGrantPlan: string | null | undefined;
  hasPaidSubscription: boolean;
};

export function isComplimentaryAccount({
  legacyPlan,
  isTestAccount,
  activeGrantPlan,
  hasPaidSubscription,
}: ComplimentaryAccountFacts): boolean {
  if (isTestAccount || hasPaidSubscription) return false;
  const grantPlan = activeGrantPlan?.trim().toLowerCase();
  return legacyPlan?.trim().toLowerCase() === "complimentary"
    || grantPlan === "core"
    || grantPlan === "max";
}
