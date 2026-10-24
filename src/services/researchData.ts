import { investigationState } from "./adminModel.ts";
import type { InvestigationState } from "./adminModel.ts";
import type { AdminSubjectSummary } from "./adminRecords.ts";

export interface RecordFilters {
  code: string;
  physician: string;
  status: "all" | InvestigationState;
  fromDate: string;
  toDate: string;
}

export const emptyRecordFilters: Readonly<RecordFilters> = Object.freeze({
  code: "",
  physician: "",
  status: "all",
  fromDate: "",
  toDate: "",
});

export function localDateKey(value: Date | null): string | null {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validDateRange(
  filters: Pick<RecordFilters, "fromDate" | "toDate">,
): boolean {
  return (
    (!filters.fromDate || validCalendarDate(filters.fromDate)) &&
    (!filters.toDate || validCalendarDate(filters.toDate)) &&
    (!filters.fromDate || !filters.toDate || filters.fromDate <= filters.toDate)
  );
}

/** Filtering uses the already authorized in-memory dataset; no Firestore calls. */
export function filterResearchSubjects(
  records: readonly AdminSubjectSummary[],
  filters: RecordFilters,
): AdminSubjectSummary[] {
  if (!validDateRange(filters)) return [];
  const code = filters.code.trim().toLocaleUpperCase("tr-TR");
  return records.filter((record) => {
    if (
      code &&
      !record.subjectCode.toLocaleUpperCase("tr-TR").includes(code) &&
      !(/^\d+$/.test(code) && String(record.subjectNumber).includes(code))
    )
      return false;
    if (
      filters.physician &&
      record.publicValues.investigatorName?.trim() !== filters.physician
    )
      return false;
    if (
      filters.status !== "all" &&
      investigationState(record.investigations) !== filters.status
    )
      return false;
    if (filters.fromDate || filters.toDate) {
      const date = localDateKey(record.createdAt);
      if (
        !date ||
        (filters.fromDate && date < filters.fromDate) ||
        (filters.toDate && date > filters.toDate)
      )
        return false;
    }
    return true;
  });
}

export function researchSummary(records: readonly AdminSubjectSummary[]) {
  const counts = { total: records.length, empty: 0, partial: 0, complete: 0 };
  const physicians = new Map<string, number>();
  for (const record of records) {
    counts[investigationState(record.investigations)]++;
    const name =
      record.publicValues.investigatorName?.trim() || "Belirtilmemiş";
    physicians.set(name, (physicians.get(name) ?? 0) + 1);
  }
  return {
    ...counts,
    physicians: [...physicians]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.name.localeCompare(right.name, "tr-TR"),
      ),
    recent: records
      .filter((record) => localDateKey(record.createdAt) !== null)
      .toSorted(
        (left, right) => right.createdAt!.getTime() - left.createdAt!.getTime(),
      )
      .slice(0, 5),
  };
}
