import type {
  CrfField,
  CrfSection,
  CrfValue,
  CrfDraftValues,
  FieldId,
} from "../../types/crf.ts";
import { parseDurationPart } from "./calculations.ts";
import { isFieldVisible, publicSections } from "./sections.ts";

export type CrfErrors = Partial<Record<FieldId, string>>;

const optionalPublicFieldIds = new Set<FieldId>([
  "treatmentDurationYears",
  "bleedingOnsetInterval",
  "researchNotes",
]);

function isBlankValue(value: CrfValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return value === null;
}

export function isPublicFieldRequired(field: CrfField): boolean {
  return !field.readOnly && !optionalPublicFieldIds.has(field.id);
}

// Field-level validation remains format-only. Required-answer policy is applied
// by validateSection only to visible public fields, so conditional follow-up
// questions become mandatory only when their parent answer makes them applicable.
export function validateField(
  field: CrfField,
  value: CrfValue,
): string | undefined {
  if (field.readOnly)
    return value === null ||
      (typeof value === "number" && Number.isFinite(value))
      ? undefined
      : "Geçerli bir değer girin.";
  if (field.kind === "multiselect") {
    if (
      !Array.isArray(value) ||
      new Set(value).size !== value.length ||
      value.some((item) => !field.options.includes(item))
    )
      return "Listeden geçerli seçenekler işaretleyin.";
    return undefined;
  }
  if (typeof value !== "string") return "Geçerli bir değer girin.";
  if (!value.trim()) return undefined;
  if (
    (field.kind === "radio" || field.kind === "select") &&
    !field.options.includes(value)
  )
    return "Listeden geçerli bir seçenek seçin.";
  if (field.kind === "number") {
    if (!Number.isFinite(Number(value))) return "Geçerli bir sayı girin.";
    if (field.integer && parseDurationPart(value, field.max) === null)
      return field.max === 11
        ? "Ay değeri 0-11 arasında bir tam sayı olmalıdır."
        : "Yıl değeri negatif olmayan bir tam sayı olmalıdır.";
    if (
      field.id === "treatmentDurationYears" &&
      !Number.isSafeInteger(Number(value) * 12)
    )
      return "Hesaplanabilir bir yıl değeri girin.";
  }
  if (field.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return "Geçerli bir saat girin.";
  if (field.kind === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "Geçerli bir tarih girin.";
    const year = Number(match[1]),
      month = Number(match[2]),
      day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > (days[month - 1] ?? 0)
    )
      return "Geçerli bir tarih girin.";
  }
  return undefined;
}
export function validateSection(
  section: CrfSection,
  values: CrfDraftValues,
): CrfErrors {
  const errors: CrfErrors = {};
  for (const field of section.fields) {
    if (!isFieldVisible(field, values)) continue;
    const value = values[field.id];
    if (
      section.entryRole === "public" &&
      isPublicFieldRequired(field) &&
      isBlankValue(value)
    ) {
      errors[field.id] = "Bu alan zorunludur.";
      continue;
    }
    const error = validateField(field, value);
    if (error) errors[field.id] = error;
  }
  return errors;
}
export function validatePublicCrf(values: CrfDraftValues): CrfErrors {
  return Object.assign(
    {},
    ...publicSections.map((section) => validateSection(section, values)),
  ) as CrfErrors;
}
