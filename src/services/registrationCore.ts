import { toCrfValues } from "../components/crf/calculations.ts";
import { publicSections } from "../components/crf/sections.ts";
import { validatePublicCrf } from "../components/crf/validation.ts";
import type { CrfDraftValues, PublicCrfValues } from "../types/crf.ts";

export interface RegistrationResult {
  subjectId: string;
  subjectCode: string;
  subjectNumber: number;
  requestId: string;
}

export interface SubjectDocument {
  subjectCode: string;
  subjectNumber: number;
  status: "pending_completion";
  createdAt: unknown;
  updatedAt: unknown;
  createdByUid: string;
  requestId: string;
  publicValues: PublicCrfValues;
  investigations: Record<string, never>;
}

export interface CounterDocument {
  lastAllocatedNumber: number;
  lastSubjectId: string;
  lastRequestId: string;
  lastCreatedByUid: string;
}

export interface RegistrationTransaction {
  getReceipt(uid: string, requestId: string): Promise<unknown | null>;
  getCounter(): Promise<unknown | null>;
  createSubject(subjectId: string, data: SubjectDocument): void;
  createReceipt(
    uid: string,
    requestId: string,
    result: RegistrationResult,
  ): void;
  updateCounter(data: CounterDocument): void;
}

export interface RegistrationStore {
  newSubjectId(): string;
  timestamp(): unknown;
  runTransaction<T>(
    operation: (transaction: RegistrationTransaction) => Promise<T>,
  ): Promise<T>;
}

export function formatSubjectCode(number: number): string {
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("Invalid subject number");
  return `AHT-${String(number).padStart(3, "0")}`;
}

export function isRequestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

// Only metadata-declared public answers cross the write boundary. No Section 4 data,
// temporary UI values, credentials or unspecified object properties are copied.
export function preparePublicValues(draft: CrfDraftValues): PublicCrfValues {
  if (Object.keys(validatePublicCrf(draft)).length)
    throw new Error("Invalid form values");
  const model = toCrfValues(draft);
  const values = Object.fromEntries(
    publicSections.flatMap((section) =>
      section.fields.map((field) => {
        const answer = model[field.id];
        return [field.id, Array.isArray(answer) ? [...answer] : answer];
      }),
    ),
  );
  return {
    ...values,
    treatmentDurationTotalMonths: model.treatmentDurationTotalMonths,
  } as PublicCrfValues;
}

function previousResult(value: unknown, requestId: string): RegistrationResult {
  if (!value || typeof value !== "object")
    throw new Error("Invalid registration receipt");
  const receipt = value as Partial<RegistrationResult>;
  if (
    receipt.requestId !== requestId ||
    typeof receipt.subjectId !== "string" ||
    !/^[A-Za-z0-9]{20}$/.test(receipt.subjectId) ||
    typeof receipt.subjectNumber !== "number" ||
    receipt.subjectCode !== formatSubjectCode(receipt.subjectNumber)
  )
    throw new Error("Invalid registration receipt");
  return {
    subjectId: receipt.subjectId,
    subjectCode: receipt.subjectCode,
    subjectNumber: receipt.subjectNumber,
    requestId,
  };
}

/** The adapter must use a real atomic Firestore transaction, not sequential writes. */
export async function allocateSubject(
  store: RegistrationStore,
  uid: string,
  requestId: string,
  publicValues: PublicCrfValues,
): Promise<RegistrationResult> {
  if (!uid || uid.includes("/") || !isRequestId(requestId))
    throw new Error("Invalid registration request");
  const savedValues = structuredClone(publicValues);
  const subjectId = store.newSubjectId();
  if (!/^[A-Za-z0-9]{20}$/.test(subjectId))
    throw new Error("Invalid subject identifier");
  return store.runTransaction(async (transaction) => {
    // This receipt has no research data. Public clients never read a subject, even
    // their own. A successful retry returns the original result without allocation.
    const receipt = await transaction.getReceipt(uid, requestId);
    if (receipt !== null) return previousResult(receipt, requestId);
    const counter = await transaction.getCounter();
    const last =
      counter && typeof counter === "object"
        ? (counter as { lastAllocatedNumber?: unknown }).lastAllocatedNumber
        : undefined;
    if (
      typeof last !== "number" ||
      !Number.isSafeInteger(last) ||
      last < -1 ||
      last >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error("Counter is not initialized correctly");
    }
    const subjectNumber = last + 1;
    const result = {
      subjectId,
      subjectCode: formatSubjectCode(subjectNumber),
      subjectNumber,
      requestId,
    };
    const timestamp = store.timestamp();
    transaction.createSubject(subjectId, {
      subjectCode: result.subjectCode,
      subjectNumber,
      status: "pending_completion",
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUid: uid,
      requestId,
      publicValues: savedValues,
      investigations: {},
    });
    transaction.createReceipt(uid, requestId, result);
    transaction.updateCounter({
      lastAllocatedNumber: subjectNumber,
      lastSubjectId: subjectId,
      lastRequestId: requestId,
      lastCreatedByUid: uid,
    });
    return result;
  });
}
