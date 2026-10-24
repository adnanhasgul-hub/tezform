import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { CrfDraftValues } from "../types/crf";
import { ensureAnonymousUser } from "./auth";
import { allocateSubject, preparePublicValues } from "./registrationCore";
import type { RegistrationResult, RegistrationStore } from "./registrationCore";

export class RegistrationConnectionError extends Error {
  constructor() {
    super("Registration connection unavailable");
    this.name = "RegistrationConnectionError";
  }
}
export class RegistrationSaveError extends Error {
  constructor() {
    super("Registration could not be saved");
    this.name = "RegistrationSaveError";
  }
}

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
    const counterRef = doc(database, "systemCounters", "subjects");
    const store: RegistrationStore = {
      newSubjectId: () => doc(collection(database, "subjects")).id,
      timestamp: () => serverTimestamp(),
      runTransaction: (operation) =>
        runTransaction(database, async (transaction) =>
          operation({
            getReceipt: async (uid, id) => {
              const snapshot = await transaction.get(
                doc(database, "submissionRequests", uid, "requests", id),
              );
              return snapshot.exists() ? snapshot.data() : null;
            },
            getCounter: async () => {
              const snapshot = await transaction.get(counterRef);
              return snapshot.exists() ? snapshot.data() : null;
            },
            createSubject: (id, data) => {
              transaction.set(doc(database, "subjects", id), data);
            },
            createReceipt: (uid, id, result) => {
              transaction.set(
                doc(database, "submissionRequests", uid, "requests", id),
                result,
              );
            },
            updateCounter: (data) => {
              transaction.set(counterRef, data);
            },
          }),
        ),
    };
    return await allocateSubject(store, user.uid, requestId, publicValues);
  } catch {
    // Do not return Firebase error details or attach the research payload to errors.
    throw new RegistrationSaveError();
  }
}
