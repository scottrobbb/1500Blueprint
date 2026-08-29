import { DEFAULT_AUTH_DESTINATION } from "./password";

export const ACCOUNT_CLAIM_DESTINATION = "/account/claim?next=%2Fultimate";

export function destinationAfterMagicLink(input: {
  passwordAuthEnabled: boolean;
  hasPasswordIdentity: boolean;
}): string {
  return input.passwordAuthEnabled && !input.hasPasswordIdentity
    ? ACCOUNT_CLAIM_DESTINATION
    : DEFAULT_AUTH_DESTINATION;
}
