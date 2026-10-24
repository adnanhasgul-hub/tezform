import type { CrfDraftValues, CrfValues } from "../../types/crf.ts";

export function getLocalCalendarDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function calculateBmi(
  weightInput: string,
  heightInput: string,
): number | null {
  if (!weightInput.trim() || !heightInput.trim()) return null;
  const weight = Number(weightInput),
    heightCm = Number(heightInput);
  if (
    !Number.isFinite(weight) ||
    !Number.isFinite(heightCm) ||
    weight <= 0 ||
    heightCm <= 0
  )
    return null;
  const result = weight / (heightCm / 100) ** 2;
  if (!Number.isFinite(result) || result <= 0) return null;
  const rounded = Math.round((result + Number.EPSILON * result) * 10) / 10;
  return Number.isFinite(rounded) ? rounded : null;
}

export function parseDurationPart(input: string, max?: number): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const number = Number(input);
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    (max !== undefined && number > max)
  )
    return null;
  return number;
}

export function getTreatmentDuration(yearsInput: string, monthsInput: string) {
  const years = parseDurationPart(yearsInput);
  const months = parseDurationPart(monthsInput, 11);
  if (years === null || months === null) return null;
  const totalMonths = years * 12 + months;
  return Number.isSafeInteger(totalMonths)
    ? { years, months, totalMonths }
    : null;
}

export function describeTreatmentDuration(
  years: string,
  months: string,
): string {
  const result = getTreatmentDuration(years, months);
  return result ? `${result.years} yıl ${result.months} aydır` : "";
}

export function recalculateDerived(values: CrfDraftValues): CrfDraftValues {
  return {
    ...values,
    bmi: calculateBmi(values.weight, values.height),
    treatmentDurationTotalMonths:
      getTreatmentDuration(
        values.treatmentDurationYears,
        values.treatmentDurationMonths,
      )?.totalMonths ?? null,
  };
}

// A typed numeric data model for a future backend; no storage or network operation.
export function toCrfValues(draft: CrfDraftValues): CrfValues {
  const values = recalculateDerived(draft);
  return {
    ...values,
    treatmentDurationYears: parseDurationPart(values.treatmentDurationYears),
    treatmentDurationMonths: parseDurationPart(
      values.treatmentDurationMonths,
      11,
    ),
  };
}
