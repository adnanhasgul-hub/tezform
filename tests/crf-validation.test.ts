import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  crfSections,
  createEmptyCrf,
  formCopy,
  getEditableSections,
  isFieldVisible,
  isSectionEditable,
  publicSections,
} from "../src/components/crf/sections.ts";
import {
  validateField,
  validatePublicCrf,
} from "../src/components/crf/validation.ts";

const fields = crfSections.flatMap((section) => section.fields);
const field = (id: string) => {
  const result = fields.find((item) => item.id === id);
  assert(result);
  return result;
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

// This reviewed fixture is an independent transcription of the supplied clinical text.
// Blank lines, underscores and checkbox glyphs are presentation, not clinical answers.
test("every clinical heading, question, option, explanatory text and unit matches the source transcript in order", () => {
  const transcript = [formCopy.title, formCopy.subtitle, formCopy.warning];
  for (const section of crfSections) {
    transcript.push(`BÖLÜM ${section.number}: ${section.title}`);
    for (const item of section.fields) {
      if (item.group) transcript.push(item.group);
      if (item.label) transcript.push(item.label);
      if (item.prefix) transcript.push(item.prefix);
      if (item.kind === "radio" || item.kind === "multiselect")
        transcript.push(...item.options);
      if (item.unit) transcript.push(item.unit);
      if (item.hint) transcript.push(item.hint);
    }
  }
  const expected = readFileSync(
    new URL("./fixtures/source-crf.txt", import.meta.url),
    "utf8",
  );
  assert.equal(normalize(transcript.join("\n")), normalize(expected));
});

test("all source answers have unique fields and the sole Section 1 laboratory exception is respected", () => {
  assert.deepEqual(
    crfSections.map((section) => section.fields.length),
    [9, 5, 5, 21, 18, 7, 6],
  );
  assert.equal(fields.length, 71);
  assert.equal(new Set(fields.map((item) => item.id)).size, 71);
  assert.equal(publicSections.flatMap((section) => section.fields).length, 50);
  const demographics = crfSections[0]!;
  const labIds = getEditableSections("admin-completion").flatMap((section) =>
    section.fields.map((item) => item.id),
  );
  assert(!demographics.fields.some((item) => labIds.includes(item.id)));
  assert(
    !demographics.fields.some((item) =>
      /Laboratuvar|Serum Kreatinin|CrCl|ALT|AST|Hemoglobin/.test(item.label),
    ),
  );
  assert.equal(
    demographics.fields.find((item) => item.id === "bmi")?.unit,
    "kg/m²",
  );
  assert.equal(field("protocolDate").printTemplate, "____/____/202___");
});

test("public and admin access remain separated, including validation", () => {
  assert.deepEqual(
    publicSections.map((section) => section.number),
    [1, 2, 3, 5, 6, 7],
  );
  assert.deepEqual(
    getEditableSections("admin-completion").map((section) => section.number),
    [4],
  );
  assert(crfSections.every((section) => !isSectionEditable(section, "print")));
  const values = createEmptyCrf();
  for (const item of getEditableSections("admin-completion")[0]!.fields) {
    if (item.kind === "multiselect") values[item.id] = ["invalid"];
    else values[item.id] = "invalid";
  }
  assert.deepEqual(validatePublicCrf(values), {});
});

test("no clinical field is mandatory, and blank answers have no invented meaning", () => {
  assert(fields.every((item) => item.required === false));
  const values = createEmptyCrf();
  assert.deepEqual(validatePublicCrf(values), {});
  for (const item of fields)
    assert.equal(validateField(item, values[item.id]), undefined);
  assert.equal(values.adherence, "");
  assert.deepEqual(values.otherAntithrombotic, []);
});

test("conditional source answers are separate, retain their values and are validated only when applicable", () => {
  const values = createEmptyCrf();
  assert.equal(isFieldVisible(field("epistaxisFrequency"), values), false);
  values.epistaxis = "Evet ->";
  assert.equal(isFieldVisible(field("epistaxisFrequency"), values), true);
  assert.equal(isFieldVisible(field("epistaxisDuration"), values), true);
  values.epistaxisFrequency = "Haftalık";
  values.epistaxisDuration = ">10 dk";
  values.epistaxis = "Hayır";
  assert.equal(values.epistaxisFrequency, "Haftalık");
  assert.equal(values.epistaxisDuration, ">10 dk");
  values.transfusionUnits = "not a number";
  assert(!validatePublicCrf(values).transfusionUnits);
  values.transfusion = "Evet ->";
  assert(validatePublicCrf(values).transfusionUnits);
  values.transfusionUnits = "2";
  assert(!validatePublicCrf(values).transfusionUnits);
  for (const item of fields.filter((item) => item.when))
    assert(fields.some((parent) => parent.id === item.when?.fieldId));
});

test("DVT choices remain multiple and independent; lab units and all 14 ISTH questions are preserved", () => {
  assert.equal(
    validateField(field("dvtLocations"), ["İliak", "Popliteal"]),
    undefined,
  );
  assert.equal(validateField(field("dvtSide"), ["Sağ", "Sol"]), undefined);
  assert(validateField(field("dvtSide"), ["Sağ", "Sağ"]));
  const values = createEmptyCrf(),
    other = createEmptyCrf();
  values.dvtLocations.push("Femoral");
  assert.deepEqual(values.dvtSide, []);
  assert.deepEqual(other.dvtLocations, []);
  assert.equal(field("egfr").unit, "mL/dk");
  assert.equal(field("sodium").unit, "mEq/L");
  assert.equal(field("potassium").unit, "mEq/L");
  assert.equal(field("wbc").unit, "K/uL");
  assert.equal(field("platelets").unit, "K/uL");
  const symptoms = crfSections.find((section) => section.number === 5)!;
  assert.equal(
    symptoms.fields.filter((item) => /^\d+\./.test(item.label)).length,
    14,
  );
  assert.equal(symptoms.fields.filter((item) => item.group).length, 5);
});

test("format checks do not impose clinical ranges, rounding or text truncation", () => {
  assert.equal(validateField(field("age"), "121"), undefined);
  assert.equal(validateField(field("transfusionUnits"), "0.5"), undefined);
  assert.equal(
    validateField(field("researchNotes"), "a".repeat(5000)),
    undefined,
  );
  assert(validateField(field("age"), "NaN"));
  assert(validateField(field("sex"), "not a source option"));
  assert.equal(validateField(field("assessmentDate"), "2024-02-29"), undefined);
  assert(validateField(field("assessmentDate"), "2025-02-29"));
  assert.equal(validateField(field("lastDoseTime"), "23:59"), undefined);
  assert(validateField(field("lastDoseTime"), "24:00"));
});
