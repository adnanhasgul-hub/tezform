import { createEmptyCrf, crfSections } from "../components/crf/sections.ts";
import type {
  CrfDraftValues,
  InvestigationValues,
  StoredInvestigationValues,
} from "../types/crf.ts";
import { normalizeDvt, ambiguousLegacyLocations } from "./dvtModel.ts";
import { isFieldVisible } from "../components/crf/sections.ts";
import type { AdminSubjectSummary } from "./adminRecords.ts";
export const investigationSection = crfSections.find(
  (section) => section.entryRole === "admin",
)!;
export type InvestigationState = "empty" | "partial" | "complete";
export function investigationState(
  values: StoredInvestigationValues,
): InvestigationState {
  const canonical = { ...createEmptyCrf(), ...values, ...normalizeDvt(values) };
  const applicable = investigationSection.fields.filter((field) =>
    isFieldVisible(field, canonical),
  );
  const filled = applicable.filter((field) => {
    const value = canonical[field.id];
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "string" && value.trim().length > 0;
  }).length;
  const hasLegacyData = ambiguousLegacyLocations(values).length > 0;
  return filled === 0 && !hasLegacyData
    ? "empty"
    : filled === applicable.length && !hasLegacyData
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
  const canonical = { ...draft, ...normalizeDvt(draft) };
  return Object.fromEntries(
    investigationSection.fields.map((field) => [field.id, canonical[field.id]]),
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
  const investigations = investigationValues({
    ...createEmptyCrf(),
    ...subject.investigations,
    ...normalizeDvt(subject.investigations),
  });
  return {
    ...createEmptyCrf(),
    ...subject.publicValues,
    ...investigations,
    ...(ambiguousLegacyLocations(subject.investigations).length
      ? { legacyDvtLocations: ambiguousLegacyLocations(subject.investigations) }
      : {}),
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
