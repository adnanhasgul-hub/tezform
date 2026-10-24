import { investigationValues, recordStatus } from "./adminModel";
import { preparePublicValues } from "./registrationCore";
import { validateSection } from "../components/crf/validation";
import { investigationSection } from "./adminModel";
import { reauthenticateAdmin } from "./auth";
import { reauthenticatedDelete } from "./adminDeletion";
import { deleteSubjectTransaction } from "./adminStore";
import type { CrfDraftValues } from "../types/crf";
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

export async function saveAdminSubject(
  subjectId: string,
  draft: CrfDraftValues,
  fullEdit: boolean,
): Promise<void> {
  if (!db) throw new Error("Firestore unavailable");
  if (Object.keys(validateSection(investigationSection, draft)).length)
    throw new Error("Invalid investigations");
  const investigations = investigationValues(draft);
  await updateDoc(doc(db, "subjects", subjectId), {
    investigations,
    status: recordStatus(investigations),
    updatedAt: serverTimestamp(),
    ...(fullEdit ? { publicValues: preparePublicValues(draft) } : {}),
  });
}
export async function deleteAdminSubject(
  subjectId: string,
  password: string,
): Promise<void> {
  const database = db;
  if (!database) throw new Error("Firestore unavailable");
  await reauthenticatedDelete(password, reauthenticateAdmin, async () => {
    await deleteSubjectTransaction(database, subjectId);
  });
}
