import { createEmptyCrf, crfSections } from "../components/crf/sections.ts";
import type { CrfDraftValues, InvestigationValues } from "../types/crf.ts";
import type { AdminSubjectSummary } from "./adminRecords.ts";
export const investigationSection = crfSections.find(
  (section) => section.entryRole === "admin",
)!;
export type InvestigationState = "empty" | "partial" | "complete";
export function investigationState(
  values: Partial<InvestigationValues>,
): InvestigationState {
  const filled = investigationSection.fields.filter((field) => {
    const value = values[field.id as keyof InvestigationValues];
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "string" && value.trim().length > 0;
  }).length;
  return filled === 0
    ? "empty"
    : filled === investigationSection.fields.length
      ? "complete"
      : "partial";
}
export const investigationLabels = {
  empty: "Boş",
  partial: "Devam Et",
  complete: "Tamamlandı",
} as const;
export function investigationValues(
  draft: CrfDraftValues,
): InvestigationValues {
  return Object.fromEntries(
    investigationSection.fields.map((field) => [field.id, draft[field.id]]),
  ) as InvestigationValues;
}
export function recordStatus(values: Partial<InvestigationValues>) {
  return investigationState(values) === "complete"
    ? ("completed" as const)
    : ("pending_completion" as const);
}
export function createAdminRecordDraft(
  subject: Pick<AdminSubjectSummary, "publicValues" | "investigations">,
): CrfDraftValues {
  return {
    ...createEmptyCrf(),
    ...subject.publicValues,
    ...subject.investigations,
    treatmentDurationYears:
      subject.publicValues.treatmentDurationYears == null
        ? ""
        : String(subject.publicValues.treatmentDurationYears),
    treatmentDurationMonths:
      subject.publicValues.treatmentDurationMonths == null
        ? ""
        : String(subject.publicValues.treatmentDurationMonths),
  };
}
