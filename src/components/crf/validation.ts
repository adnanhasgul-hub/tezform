import type {
  CrfField,
  CrfSection,
  CrfValue,
  CrfValues,
  FieldId,
} from "../../types/crf.ts";
import { isFieldVisible, publicSections } from "./sections.ts";

export type CrfErrors = Partial<Record<FieldId, string>>;

// The source questionnaire specifies no mandatory answers or clinical numeric limits.
// Validate only the format of supplied, currently applicable answers.
export function validateField(
  field: CrfField,
  value: CrfValue,
): string | undefined {
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
  if (field.kind === "radio" && !field.options.includes(value))
    return "Listeden geçerli bir seçenek seçin.";
  if (field.kind === "number" && !Number.isFinite(Number(value)))
    return "Geçerli bir sayı girin.";
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
  values: CrfValues,
): CrfErrors {
  const errors: CrfErrors = {};
  for (const field of section.fields) {
    if (!isFieldVisible(field, values)) continue;
    const error = validateField(field, values[field.id]);
    if (error) errors[field.id] = error;
  }
  return errors;
}
export function validatePublicCrf(values: CrfValues): CrfErrors {
  return Object.assign(
    {},
    ...publicSections.map((section) => validateSection(section, values)),
  ) as CrfErrors;
}
