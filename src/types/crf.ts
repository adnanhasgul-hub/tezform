export type EligibilityAnswer = "" | "yes" | "no";

export type PublicFieldId =
  | "participantCode"
  | "age"
  | "sex"
  | "weight"
  | "height"
  | "indication"
  | "dose"
  | "frequency"
  | "treatmentStart"
  | "adherence"
  | "missedDoses"
  | "otherAnticoagulant"
  | "nsaid"
  | "ssri"
  | "otherMedications"
  | "epistaxis"
  | "gingivalBleeding"
  | "bruising"
  | "giBleeding"
  | "hematuria"
  | "otherBleeding"
  | "severity"
  | "hospitalization"
  | "transfusion"
  | "outcome"
  | "bleedingOnset"
  | "lastDoseAt"
  | "assessmentDate"
  | "investigator"
  | "researchNotes";

export type DvtFieldId = "dvtLocations" | "dvtSide";
export type InvestigationFieldId =
  | DvtFieldId
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

export type FieldId = PublicFieldId | InvestigationFieldId;
export type CrfValues = {
  [K in FieldId]: K extends DvtFieldId ? string[] : string;
};
export type CrfValue = CrfValues[FieldId];

interface BaseField {
  id: FieldId;
  label: string;
  required: boolean;
  hint?: string;
  group?: string;
}

export type CrfField = BaseField &
  (
    | { id: DvtFieldId; kind: "multiselect"; options: readonly string[] }
    | ({ id: Exclude<FieldId, DvtFieldId> } & (
        | { kind: "text" | "date" | "datetime-local" | "textarea" }
        | { kind: "number"; min: number; max?: number; step?: string }
        | { kind: "select"; options: readonly string[] }
      ))
  );

export interface CrfSection {
  id: string;
  number: number;
  shortTitle: string;
  entryRole: "public" | "admin";
  title: string;
  description: string;
  fields: readonly CrfField[];
}

export type DigitalCrfContext = "digital-public" | "admin-completion";
export type CrfContext = DigitalCrfContext | "print";
export type PublicCrfValues = Pick<CrfValues, PublicFieldId>;
export type InvestigationValues = Pick<CrfValues, InvestigationFieldId>;
export type CrfRecordStatus = "pending_completion" | "completed";

// Future persistence model only. Public validation does not create or save a record.
export type CrfRecord = { publicValues: PublicCrfValues } & (
  | {
      status: "pending_completion";
      investigations: Partial<InvestigationValues>;
    }
  | { status: "completed"; investigations: InvestigationValues }
);
