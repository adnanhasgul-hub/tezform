import { createRegistrationStore } from "./registrationStore";
import { retryRegistration, RegistrationSaveError } from "./registrationRetry";

import { db } from "../firebase/client";
import type { CrfDraftValues } from "../types/crf";
import { ensureAnonymousUser } from "./auth";
import { allocateSubject, preparePublicValues } from "./registrationCore";
import type { RegistrationResult } from "./registrationCore";

export class RegistrationConnectionError extends Error {
  constructor() {
    super("Registration connection unavailable");
    this.name = "RegistrationConnectionError";
  }
}
export { RegistrationSaveError } from "./registrationRetry";

export async function registerSubject(
  draft: CrfDraftValues,
  requestId: string,
): Promise<RegistrationResult> {
  const database = db;
  if (!database) throw new RegistrationConnectionError();
  const user = await ensureAnonymousUser().catch(() => {
    throw new RegistrationConnectionError();
  });
  if (!user.isAnonymous) throw new RegistrationConnectionError();
  try {
    const publicValues = preparePublicValues(draft);
    const store = createRegistrationStore(database);
    return await retryRegistration(() =>
      allocateSubject(store, user.uid, requestId, publicValues),
    );
  } catch {
    // Do not return Firebase error details or attach the research payload to errors.
    throw new RegistrationSaveError();
  }
}
