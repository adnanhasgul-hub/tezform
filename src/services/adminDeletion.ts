// Reauthentication must succeed before a mutation is even started.
export async function reauthenticatedDelete(
  password: string,
  reauthenticate: (password: string) => Promise<void>,
  remove: () => Promise<void>,
): Promise<void> {
  if (!password) throw new Error("Reauthentication required");
  await reauthenticate(password);
  await remove();
}
