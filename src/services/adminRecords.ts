import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type {
  CrfRecordStatus,
  InvestigationValues,
  PublicCrfValues,
} from "../types/crf";

export interface AdminSubjectSummary {
  id: string;
  subjectCode: string;
  subjectNumber: number;
  status: CrfRecordStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
  publicValues: PublicCrfValues;
  investigations: Partial<InvestigationValues>;
}

function timestampToDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function parsePublicValues(value: unknown): PublicCrfValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public CRF values");
  }
  return value as PublicCrfValues;
}

function parseInvestigations(value: unknown): Partial<InvestigationValues> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<InvestigationValues>;
}

function parseSubject(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): AdminSubjectSummary {
  const data = snapshot.data();
  if (
    typeof data.subjectCode !== "string" ||
    typeof data.subjectNumber !== "number" ||
    !Number.isSafeInteger(data.subjectNumber) ||
    data.subjectNumber < 0 ||
    (data.status !== "pending_completion" && data.status !== "completed")
  ) {
    throw new Error(`Invalid subject document: ${snapshot.id}`);
  }
  return {
    id: snapshot.id,
    subjectCode: data.subjectCode,
    subjectNumber: data.subjectNumber,
    status: data.status,
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    publicValues: parsePublicValues(data.publicValues),
    investigations: parseInvestigations(data.investigations),
  };
}

export async function listAdminSubjects(): Promise<AdminSubjectSummary[]> {
  if (!db) throw new Error("Firestore unavailable");
  const snapshot = await getDocs(
    query(collection(db, "subjects"), orderBy("subjectNumber", "desc")),
  );
  return snapshot.docs.map(parseSubject);
}

export async function completeAdminSubject(
  subjectId: string,
  investigations: InvestigationValues,
): Promise<void> {
  if (!db) throw new Error("Firestore unavailable");
  await updateDoc(doc(db, "subjects", subjectId), {
    investigations,
    status: "completed",
    updatedAt: serverTimestamp(),
  });
}

export async function updateAdminSubjectInvestigations(
  subjectId: string,
  investigations: InvestigationValues,
): Promise<void> {
  if (!db) throw new Error("Firestore unavailable");
  await updateDoc(doc(db, "subjects", subjectId), {
    investigations,
    updatedAt: serverTimestamp(),
  });
}
