export function hasActiveStaffAssignment(
  roleAssigned: boolean,
  accountStatus: string | null | undefined,
): boolean {
  return roleAssigned && accountStatus === "active";
}
