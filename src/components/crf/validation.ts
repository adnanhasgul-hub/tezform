import type {
  CrfField,
  CrfSection,
  CrfValues,
  CrfValue,
  FieldId,
} from "../../types/crf.ts";
import { publicSections } from "./sections.ts";

export type CrfErrors = Partial<Record<FieldId, string>>;
export const requiredError = "Bu alanın doldurulması zorunludur.";

export function getMaxLength(field: CrfField): number | undefined {
  return field.kind === "text"
    ? 200
    : field.kind === "textarea"
      ? 2000
      : undefined;
}

export function validateField(
  field: CrfField,
  value: CrfValue,
): string | undefined {
  if (field.kind === "multiselect") {
    if (!Array.isArray(value)) return "Geçerli seçenekleri işaretleyin.";
    if (!value.length) return field.required ? requiredError : undefined;
    if (
      new Set(value).size !== value.length ||
      value.some((item) => !field.options.includes(item))
    )
      return "Listeden geçerli seçenekler işaretleyin.";
    return undefined;
  }
  if (typeof value !== "string") return "Geçerli bir değer girin.";
  if (!value.trim()) return field.required ? requiredError : undefined;
  const maxLength = getMaxLength(field);
  if (maxLength && value.length > maxLength)
    return `En fazla ${maxLength} karakter girin.`;
  if (field.kind === "select" && !field.options.includes(value))
    return "Listeden geçerli bir seçenek seçin.";
  if (field.kind === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Geçerli bir sayı girin.";
    if (number < field.min) return `En az ${field.min} değerini girin.`;
    if (field.max !== undefined && number > field.max)
      return `En fazla ${field.max} değerini girin.`;
    const step = Number(field.step ?? "1");
    const steps = (number - field.min) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-7)
      return `${field.step ?? "1"} aralıklarına uygun bir değer girin.`;
  }
  if (field.kind === "date" || field.kind === "datetime-local") {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
    if (!match || (field.kind === "date" ? !!match[4] : !match[4]))
      return "Geçerli bir tarih girin.";
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
      day > (days[month - 1] ?? 0) ||
      Number(match[4] ?? 0) > 23 ||
      Number(match[5] ?? 0) > 59
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

export function getRequiredProgress(values: CrfValues) {
  const requiredFields = publicSections.flatMap((section) =>
    section.fields.filter((field) => field.required),
  );
  const valid = requiredFields.filter(
    (field) => !validateField(field, values[field.id]),
  ).length;
  return {
    valid,
    total: requiredFields.length,
    percent: requiredFields.length
      ? Math.round((100 * valid) / requiredFields.length)
      : 0,
  };
}
