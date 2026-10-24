export type EligibilityAnswer = "" | "yes" | "no";

export type PublicFieldId =
  | "nationalId"
  | "protocolDate"
  | "sex"
  | "age"
  | "weight"
  | "height"
  | "bmi"
  | "indication"
  | "indicationOther"
  | "dailyDose"
  | "dailyDoseOther"
  | "treatmentDurationYears"
  | "treatmentDurationMonths"
  | "adherence"
  | "lastDoseTime"
  | "otherAntithrombotic"
  | "nsaid"
  | "nsaidFrequency"
  | "inhibitors"
  | "inducers"
  | "bruising"
  | "bruisingSize"
  | "gingivalBleeding"
  | "gingivalDuration"
  | "epistaxis"
  | "epistaxisFrequency"
  | "epistaxisDuration"
  | "cutBleeding"
  | "melena"
  | "hematochezia"
  | "hematemesis"
  | "hematuria"
  | "menorrhagia"
  | "headache"
  | "neurologicalSymptoms"
  | "hemarthrosis"
  | "hemoptysis"
  | "subconjunctivalBleeding"
  | "healthcareVisit"
  | "healthcareVisitType"
  | "transfusion"
  | "transfusionUnits"
  | "treatmentInterruption"
  | "interruptionDays"
  | "hemoglobinDrop"
  | "bleedingOnsetInterval"
  | "bleedingDayDose"
  | "researchNotes"
  | "investigatorName";

export type InvestigationFieldId =
  | "dvtLocations"
  | "dvtSide"
  | "bun"
  | "creatinine"
  | "egfr"
  | "calcium"
  | "sodium"
  | "potassium"
  | "totalBilirubin"
  | "directBilirubin"
  | "ast"
  | "alt"
  | "totalProtein"
  | "albumin"
  | "wbc"
  | "hemoglobin"
  | "platelets"
  | "hct"
  | "pt"
  | "inr"
  | "aptt";

export type MultiFieldId =
  | "otherAntithrombotic"
  | "inhibitors"
  | "inducers"
  | "dvtLocations"
  | "dvtSide";

export type FieldId = PublicFieldId | InvestigationFieldId;
export type CrfValues = {
  [K in FieldId]: K extends MultiFieldId
    ? string[]
    : K extends "bmi" | "treatmentDurationYears" | "treatmentDurationMonths"
      ? number | null
      : string;
} & { treatmentDurationTotalMonths: number | null };
export type CrfDraftValues = Omit<
  CrfValues,
  "treatmentDurationYears" | "treatmentDurationMonths"
> & {
  treatmentDurationYears: string;
  treatmentDurationMonths: string;
  treatmentDurationTotalMonths: number | null;
};
export type CrfValue = CrfDraftValues[FieldId];
interface BaseField {
  id: FieldId;
  label: string;
  required: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  inputMode?: "numeric";
  min?: number;
  max?: number;
  integer?: boolean;
  hint?: string;
  group?: string;
  prefix?: string;
  unit?: string;
  printTemplate?: string;
  when?: { fieldId: FieldId; value: string };
}
export type CrfField = BaseField &
  (
    | { id: MultiFieldId; kind: "multiselect"; options: readonly string[] }
    | ({ id: Exclude<FieldId, MultiFieldId> } & (
        | { kind: "text" | "date" | "time" | "textarea" | "number" }
        | { kind: "radio" | "select"; options: readonly string[] }
      ))
  );
export interface CrfSection {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  entryRole: "public" | "admin";
  fields: readonly CrfField[];
}
export type DigitalCrfContext = "digital-public" | "admin-completion";
export type CrfContext = DigitalCrfContext | "print";
export type PublicCrfValues = Pick<
  CrfValues,
  PublicFieldId | "treatmentDurationTotalMonths"
>;
export type InvestigationValues = Pick<CrfValues, InvestigationFieldId>;
export type CrfRecordStatus = "pending_completion" | "completed";
// Model for future implementation only; this application does not save records.
export type CrfRecord = { publicValues: PublicCrfValues } & (
  | {
      status: "pending_completion";
      investigations: Partial<InvestigationValues>;
    }
  | { status: "completed"; investigations: InvestigationValues }
);
