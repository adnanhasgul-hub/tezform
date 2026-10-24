import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyCrf } from "../src/components/crf/sections.ts";
import { toCrfValues } from "../src/components/crf/calculations.ts";
import { investigationSection, investigationValues } from "../src/services/adminModel.ts";
import type { AdminSubjectSummary } from "../src/services/adminRecords.ts";
import { emptyRecordFilters, filterResearchSubjects, researchSummary, validDateRange } from "../src/services/researchData.ts";

function fixtures(): AdminSubjectSummary[] {
  const complete = investigationValues(createEmptyCrf());
  for (const field of investigationSection.fields) {
    if (field.kind === "multiselect") complete[field.id] = [field.options[0]!];
    else complete[field.id as Exclude<keyof typeof complete, "dvtSide" | "dvtRightLocations" | "dvtLeftLocations">] = "1";
  }
  complete.dvtLeftLocations = [];
  return [
    { doctor: "Dr. Mehmet", investigations: {}, date: new Date(2026, 9, 23, 23, 59) },
    { doctor: "Dr. Adnan", investigations: { bun: "0" }, date: new Date(2026, 9, 24, 0, 0) },
    { doctor: "Dr. Adnan", investigations: complete, date: new Date(2026, 9, 24, 23, 59) },
    { doctor: "Dr. Rabia", investigations: complete, date: new Date(2026, 9, 25, 12) },
    { doctor: "", investigations: {}, date: null },
  ].map((row, number) => ({ id: String(number).padStart(20, "0"), subjectCode: `AHT-00${number}`, subjectNumber: number,
    status: "completed", publicValues: { ...toCrfValues(createEmptyCrf()), investigatorName: row.doctor },
    investigations: row.investigations, createdAt: row.date, updatedAt: row.date } as AdminSubjectSummary));
}
test("research filters combine code, physician and real completion state", () => {
  const records = fixtures();
  assert.equal(filterResearchSubjects(records, emptyRecordFilters).length, 5);
  assert.deepEqual(filterResearchSubjects(records, { ...emptyRecordFilters, code: "aht-002" }).map(row => row.subjectNumber), [2]);
  assert.deepEqual(filterResearchSubjects(records, { ...emptyRecordFilters, code: "002" }).map(row => row.subjectNumber), [2]);
  assert.deepEqual(filterResearchSubjects(records, { ...emptyRecordFilters, physician: "Dr. Adnan", status: "complete" }).map(row => row.subjectNumber), [2]);
  assert.deepEqual(filterResearchSubjects(records, { ...emptyRecordFilters, status: "empty" }).map(row => row.subjectNumber), [0, 4]);
});
test("date filters include both local day boundaries, exclude missing dates only when bounded, and reject reversed ranges", () => {
  const records = fixtures();
  const day = { ...emptyRecordFilters, fromDate: "2026-10-24", toDate: "2026-10-24" };
  assert.deepEqual(filterResearchSubjects(records, day).map(row => row.subjectNumber), [1, 2]);
  assert.deepEqual(filterResearchSubjects(records, { ...day, toDate: "" }).map(row => row.subjectNumber), [1, 2, 3]);
  const invalid = { ...day, toDate: "2026-10-23" };
  assert.equal(validDateRange(invalid), false);
  assert.deepEqual(filterResearchSubjects(records, invalid), []);
});
test("operational summary counts actual answers, groups physicians and sorts recent records without changing the source dataset", () => {
  const records = fixtures();
  const before = structuredClone(records);
  Object.freeze(records);
  const summary = researchSummary(records);
  assert.deepEqual([summary.total, summary.empty, summary.partial, summary.complete], [5, 2, 1, 2]);
  assert.equal(summary.physicians.find(row => row.name === "Dr. Adnan")?.count, 2);
  assert.equal(summary.recent[0]?.subjectNumber, 3);
  filterResearchSubjects(records, { ...emptyRecordFilters, status: "complete" });
  assert.deepEqual(records, before);
});
