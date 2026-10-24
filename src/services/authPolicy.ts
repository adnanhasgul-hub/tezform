// The username is only a UI alias. It grants no Firebase or Firestore permission.
export const adminUsernameAlias = "adnan";

export function acceptsAdminAlias(username: string): boolean {
  return username.trim() === adminUsernameAlias;
}

export function canCheckAdminMembership(
  identity: { isAnonymous: boolean; providerIds: readonly string[] } | null,
): boolean {
  return (
    identity !== null &&
    !identity.isAnonymous &&
    identity.providerIds.includes("password")
  );
}
