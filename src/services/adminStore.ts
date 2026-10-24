import { doc, runTransaction, type Firestore } from "firebase/firestore";
// Authorization and fresh auth are enforced by Rules as well as the UI service.
export async function deleteSubjectTransaction(
  database: Firestore,
  subjectId: string,
): Promise<void> {
  await runTransaction(database, async (transaction) => {
    const subjectRef = doc(database, "subjects", subjectId);
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
    const receipt = await transaction.get(receiptRef);
    if (
      !receipt.exists() ||
      receipt.data().subjectId !== subjectId ||
      receipt.data().revoked
    )
      throw new Error("Receipt unavailable");
    // Deletion never reads or writes the allocation counter. The code remains
    // permanently consumed even after all clinical data has been removed.
    // A tombstone blocks old clients too: Rules deny reading revoked receipts.
    transaction.update(receiptRef, { revoked: true });
    transaction.delete(subjectRef);
  });
}
