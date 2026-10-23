import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crfSections,
  createEmptyCrf,
  getEditableSections,
  isSectionEditable,
  publicSections,
} from "../src/components/crf/sections.ts";
import {
  getRequiredProgress,
  requiredError,
  validateField,
  validatePublicCrf,
} from "../src/components/crf/validation.ts";
import type { CrfValues } from "../src/types/crf.ts";

function validPublicValues(): CrfValues {
  const values = createEmptyCrf();
  for (const field of publicSections.flatMap((section) => section.fields)) {
    if (!field.required) continue;
    if (field.kind === "multiselect") {
      values[field.id] = [field.options[0]!];
    } else {
      values[field.id] =
        field.kind === "select"
          ? field.options[0]!
          : field.kind === "number"
            ? String(Math.max(field.min, 1))
            : field.kind === "date"
              ? "2026-01-01"
              : "UI-DEMO";
    }
  }
  return values;
}

test("the same 51 unique fields serve public, admin and print contexts without laboratory duplication", () => {
  const ids = crfSections.flatMap((section) =>
    section.fields.map((field) => field.id),
  );
  assert.equal(ids.length, 51);
  assert.equal(new Set(ids).size, 51);
  assert.deepEqual(
    publicSections.map((section) => section.number),
    [1, 2, 3, 5, 6, 7],
  );
  assert.deepEqual(
    getEditableSections("admin-completion").map((section) => section.number),
    [4],
  );
  for (const section of crfSections) {
    assert.equal(isSectionEditable(section, "print"), false);
    assert(
      section.fields.every((field) => typeof field.required === "boolean"),
    );
  }
  const labIds = getEditableSections("admin-completion").flatMap((section) =>
    section.fields.map((field) => field.id),
  );
  assert.equal(labIds.length, 21);
  assert(!publicSections[0]!.fields.some((field) => labIds.includes(field.id)));
});

test("public completion excludes all lab fields; progress uses only 24 required public answers", () => {
  const blank = createEmptyCrf();
  const complete = validPublicValues();
  assert.deepEqual(getRequiredProgress(blank), {
    valid: 0,
    total: 24,
    percent: 0,
  });
  assert.deepEqual(getRequiredProgress(complete), {
    valid: 24,
    total: 24,
    percent: 100,
  });
  assert.deepEqual(validatePublicCrf(complete), {});
  for (const field of getEditableSections("admin-completion")[0]!.fields) {
    if (field.kind === "multiselect") blank[field.id] = ["invalid selection"];
    else blank[field.id] = "unusable laboratory value";
  }
  assert.deepEqual(getRequiredProgress(blank), {
    valid: 0,
    total: 24,
    percent: 0,
  });
  assert(!Object.keys(validatePublicCrf(blank)).includes("hemoglobin"));
  assert(!validatePublicCrf(complete).bleedingOnset);
});

test("blank, whitespace, invalid ranges, select values and number step mismatches fail centrally", () => {
  const values = validPublicValues();
  values.participantCode = "   ";
  values.age = "121";
  values.sex = "not a choice";
  values.missedDoses = "0.5";
  const errors = validatePublicCrf(values);
  assert.equal(errors.participantCode, requiredError);
  assert(errors.age);
  assert(errors.sex);
  assert(errors.missedDoses);
  assert.equal(getRequiredProgress(values).valid, 20);
  values.age = "42";
  assert.equal(validatePublicCrf(values).age, undefined);
});

test("optional entered values are validated, and calendar dates including leap years are checked", () => {
  const fields = crfSections.flatMap((section) => section.fields);
  const date = fields.find((field) => field.id === "treatmentStart")!;
  const time = fields.find((field) => field.id === "bleedingOnset")!;
  const note = fields.find((field) => field.id === "researchNotes")!;
  assert.equal(validateField(time, ""), undefined);
  assert.equal(validateField(date, "2024-02-29"), undefined);
  assert(validateField(date, "2025-02-29"));
  assert(validateField(date, "2026-13-01"));
  assert(validateField(date, "2026-01-01T12:00"));
  assert(validateField(time, "2026-01-01T24:00"));
  assert.equal(validateField(time, "2026-01-01T23:59"), undefined);
  assert(validateField(note, "a".repeat(2001)));
});

test("Section 4 restores both multi-select DVT questions and all 19 lab parameters in the requested order", () => {
  const section = getEditableSections("admin-completion")[0]!;
  assert.deepEqual(
    section.fields.map((field) => field.id),
    [
      "dvtLocations",
      "dvtSide",
      "bun",
      "creatinine",
      "egfr",
      "calcium",
      "sodium",
      "potassium",
      "totalBilirubin",
      "directBilirubin",
      "ast",
      "alt",
      "totalProtein",
      "albumin",
      "wbc",
      "hemoglobin",
      "platelets",
      "hct",
      "pt",
      "inr",
      "aptt",
    ],
  );
  const locations = section.fields[0]!;
  const side = section.fields[1]!;
  assert.equal(locations.kind, "multiselect");
  assert.equal(side.kind, "multiselect");
  if (locations.kind !== "multiselect" || side.kind !== "multiselect")
    throw new Error("DVT fields must support multiple selections");
  assert.deepEqual(locations.options, [
    "İliak",
    "Femoral",
    "Popliteal",
    "Üst ekstremite",
    "IVC",
    "SVC",
    "Juguler",
  ]);
  assert.deepEqual(side.options, ["Sağ", "Sol"]);
  assert.equal(
    section.fields.filter((field) => field.kind === "number").length,
    19,
  );
  assert.equal(validateField(locations, ["İliak", "Popliteal"]), undefined);
  assert.equal(validateField(side, ["Sağ", "Sol"]), undefined);
  assert.equal(validateField(locations, []), requiredError);
  assert(validateField(side, "Sağ"));
  assert(validateField(locations, ["not a location"]));
  assert(validateField(side, ["Sağ", "Sağ"]));
});

test("DVT arrays are independent and public validation excludes every admin field", () => {
  const first = createEmptyCrf();
  const second = createEmptyCrf();
  assert.deepEqual(first.dvtLocations, []);
  assert.deepEqual(first.dvtSide, []);
  first.dvtLocations.push("Femoral");
  assert.deepEqual(first.dvtSide, []);
  assert.deepEqual(second.dvtLocations, []);
  const complete = validPublicValues();
  complete.dvtLocations = ["bad option"];
  complete.dvtSide = ["bad option"];
  for (const field of getEditableSections("admin-completion")[0]!.fields) {
    if (field.kind !== "multiselect") complete[field.id] = "invalid number";
  }
  assert.deepEqual(validatePublicCrf(complete), {});
  assert.equal(getRequiredProgress(complete).percent, 100);
});
