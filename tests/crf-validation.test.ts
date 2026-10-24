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
  isPublicFieldRequired,
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
      if (
        item.kind === "radio" ||
        item.kind === "multiselect" ||
        item.kind === "select"
      )
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
    [9, 6, 5, 22, 18, 7, 4],
  );
  assert.equal(fields.length, 71);
  assert.equal(new Set(fields.map((item) => item.id)).size, 71);
  assert.equal(publicSections.flatMap((section) => section.fields).length, 49);
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
  const baselineErrors = validatePublicCrf(values);
  for (const item of getEditableSections("admin-completion")[0]!.fields) {
    if (item.kind === "multiselect") values[item.id] = ["invalid"];
    else values[item.id] = "invalid";
  }
  assert.deepEqual(validatePublicCrf(values), baselineErrors);
});

test("public completion requires every applicable editable answer except the two approved Section 7 free-text fields", () => {
  // Source metadata stays untouched; requiredness is an eCRF workflow policy.
  assert(fields.every((item) => item.required === false));
  const values = createEmptyCrf();
  const errors = validatePublicCrf(values);
  assert.equal(errors.bleedingOnsetInterval, undefined);
  assert.equal(errors.researchNotes, undefined);
  assert.equal(errors.bmi, undefined);
  assert.equal(errors.nationalId, "Bu alan zorunludur.");
  assert.equal(errors.sex, "Bu alan zorunludur.");
  assert.equal(errors.bleedingDayDose, "Bu alan zorunludur.");
  assert.equal(errors.investigatorName, "Bu alan zorunludur.");
  assert.equal(isPublicFieldRequired(field("bleedingOnsetInterval")), false);
  assert.equal(isPublicFieldRequired(field("researchNotes")), false);
  assert.equal(isPublicFieldRequired(field("bmi")), false);
  assert.equal(isPublicFieldRequired(field("nationalId")), true);
  assert.equal(validateField(field("nationalId"), ""), undefined);
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
    validateField(field("dvtRightLocations"), ["İliak", "Popliteal"]),
    undefined,
  );
  assert.equal(validateField(field("dvtSide"), ["Sağ", "Sol"]), undefined);
  assert(validateField(field("dvtSide"), ["Sağ", "Sağ"]));
  const values = createEmptyCrf(),
    other = createEmptyCrf();
  values.dvtRightLocations.push("Femoral");
  assert.deepEqual(values.dvtSide, []);
  assert.deepEqual(other.dvtRightLocations, []);
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
  assert.equal(validateField(field("protocolDate"), "2024-02-29"), undefined);
  assert(validateField(field("protocolDate"), "2025-02-29"));
  assert.equal(validateField(field("lastDoseTime"), "23:59"), undefined);
  assert(validateField(field("lastDoseTime"), "24:00"));
});

test("unapproved clinical sections and Section 7 questions exactly retain the 0435e3f source content", () => {
  const baseline = readFileSync(
    new URL("./fixtures/source-crf-0435e3f.txt", import.meta.url),
    "utf8",
  );
  const revised = readFileSync(
    new URL("./fixtures/source-crf.txt", import.meta.url),
    "utf8",
  );
  function getSection(text: string, sectionNumber: number) {
    return text.split(`BÖLÜM ${sectionNumber}:`)[1]!.split(/BÖLÜM \d+:/)[0]!;
  }
  for (const number of [3, 5, 6])
    assert.equal(
      normalize(getSection(revised, number)),
      normalize(getSection(baseline, number)),
    );
  // Phase A intentionally revises only the DVT side/location block; all 19 labs stay exact.
  const labBlock = (text: string) => getSection(text, 4).split("3. Detaylı Laboratuvar Parametreleri")[1]!;
  assert.equal(normalize(labBlock(revised)), normalize(labBlock(baseline)));
  const originalLocations = ["İliak", "Femoral", "Popliteal", "Üst Ekstremite", "IVC", "SVC", "Juguler"];
  for (const id of ["dvtRightLocations", "dvtLeftLocations"]) {
    const item = field(id);
    assert(item.kind === "multiselect");
    assert.deepEqual(item.options, originalLocations);
  }
  const old7 = getSection(baseline, 7)
    .replace("İmza / Kaşe:", "")
    .replace(/Tarih:\s*$/, "");
  const new7 = getSection(revised, 7).replace(
    /Dr\. (Mehmet|Yasin|Tuncay|Burak|Adnan|Rabia)\n/g,
    "",
  );
  assert.equal(normalize(new7), normalize(old7));
});

test("Section 7 date is removed; the only clinical date is the editable Section 1 date", () => {
  assert.deepEqual(
    fields.filter((item) => item.kind === "date").map((item) => item.id),
    ["protocolDate"],
  );
  assert(
    !crfSections
      .find((section) => section.number === 7)!
      .fields.some((item) => item.label === "Tarih:"),
  );
  assert(!fields.some((item) => String(item.id) === "assessmentDate"));
});
