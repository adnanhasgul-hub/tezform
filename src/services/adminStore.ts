import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { readFreeNumbers, releaseNumber } from "./reusableNumbers.ts";
// Authorization and fresh auth are enforced by Rules as well as the UI service.
export async function deleteSubjectTransaction(
  database: Firestore,
  subjectId: string,
): Promise<void> {
  await runTransaction(database, async (transaction) => {
    const subjectRef = doc(database, "subjects", subjectId);
    const poolRef = doc(database, "systemCounters", "reusableSubjects");
    const subject = await transaction.get(subjectRef);
    if (!subject.exists()) throw new Error("Record unavailable");
    const data = subject.data();
    const receiptRef = doc(
      database,
      "submissionRequests",
      data.createdByUid,
      "requests",
      data.requestId,
    );
    const pool = await transaction.get(poolRef);
    const receipt = await transaction.get(receiptRef);
    if (
      !receipt.exists() ||
      receipt.data().subjectId !== subjectId ||
      receipt.data().revoked
    )
      throw new Error("Receipt unavailable");
    const numbers = releaseNumber(
      readFreeNumbers(pool.exists() ? pool.data().numbers : null),
      data.subjectNumber,
    );
    transaction.set(poolRef, {
      numbers,
      lastSubjectId: subjectId,
      operation: "release",
      insertIndex: numbers.indexOf(data.subjectNumber),
    });
    // A tombstone blocks old clients too: Rules deny reading revoked receipts.
    transaction.update(receiptRef, { revoked: true });
    transaction.delete(subjectRef);
  });
}
