export class RegistrationSaveError extends Error {
  constructor() {
    super("Registration could not be saved");
    this.name = "RegistrationSaveError";
  }
}

// Only registration allocations use this bounded retry; Rules remain authoritative.
export async function retryRegistration<T>(
  operation: () => Promise<T>,
  delay: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 76))),
): Promise<T> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const denied = error !== null && typeof error === "object" &&
        "code" in error && error.code === "permission-denied";
      if (!denied || attempt === 4) throw new RegistrationSaveError();
      await delay();
    }
  }
  throw new RegistrationSaveError();
}
