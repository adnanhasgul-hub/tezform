import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import type { RegistrationStore } from "./registrationCore";
export function createRegistrationStore(
  database: Firestore,
): RegistrationStore {
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
  return store;
}
