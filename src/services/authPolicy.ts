export function canCheckAdminMembership(
  identity: { isAnonymous: boolean; providerIds: readonly string[] } | null,
): boolean {
  return (
    identity !== null &&
    !identity.isAnonymous &&
    identity.providerIds.includes("password")
  );
}
