import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  calculateBmi,
  describeTreatmentDuration,
  getLocalCalendarDate,
  getTreatmentDuration,
  recalculateDerived,
  toCrfValues,
} from "../src/components/crf/calculations.ts";
import {
  crfSections,
  createEmptyCrf,
  createNewCrf,
} from "../src/components/crf/sections.ts";
import {
  validateField,
  validatePublicCrf,
} from "../src/components/crf/validation.ts";

const fields = crfSections.flatMap((section) => section.fields);
const field = (id: string) => fields.find((item) => item.id === id)!;

test("approved metadata uses TC identity, editable date, readonly BMI, duration parts and six single-choice physicians", () => {
  assert.equal(field("nationalId").label, "Hasta TC Kimlik No:");
  assert.equal(field("nationalId").kind, "text");
  assert.equal(field("nationalId").inputMode, "numeric");
  assert(
    !fields.some((item) =>
      ["participantCode", "treatmentStart", "signatureStamp"].includes(item.id),
    ),
  );
  assert.equal(field("protocolDate").kind, "date");
  assert(!field("protocolDate").readOnly);
  assert.equal(field("bmi").readOnly, true);
  assert.equal(
    field("treatmentDurationYears").group,
    "Ne Kadar Süredir Apixaban Kullanıyor?",
  );
  assert.equal(field("treatmentDurationYears").min, 0);
  assert.equal(field("treatmentDurationMonths").max, 11);
  const physician = field("investigatorName");
  assert.equal(physician.kind, "select");
  if (physician.kind !== "select")
    throw Error("Expected single-select physician");
  assert.deepEqual(physician.options, [
    "Dr. Mehmet",
    "Dr. Yasin",
    "Dr. Tuncay",
    "Dr. Burak",
    "Dr. Adnan",
    "Dr. Rabia",
  ]);
  assert.equal(validateField(physician, "Dr. Adnan"), undefined);
  assert(validateField(physician, "Other"));
});

test("new form sets local calendar date and DVT/PE indication, while blank forms have no marked defaults", () => {
  const day = new Date(2026, 9, 24, 0, 1);
  const values = createNewCrf(day);
  assert.equal(values.protocolDate, "2026-10-24");
  assert.equal(
    values.indication,
    "Derin Ven Trombozu (DVT) veya Akciğer Embolisi (PE) tedavisi / önlenmesi",
  );
  assert.equal(createEmptyCrf().protocolDate, "");
  assert.equal(createEmptyCrf().indication, "");
  values.protocolDate = "2026-09-01";
  values.indication = "Diğer:";
  values.indicationOther = "UI-DEMO";
  const updated = recalculateDerived(values);
  assert.equal(updated.protocolDate, "2026-09-01");
  assert.equal(updated.indication, "Diğer:");
  assert.equal(updated.indicationOther, "UI-DEMO");
  assert.equal(createNewCrf(day).protocolDate, "2026-10-24");
  assert.equal(
    getLocalCalendarDate(new Date(2026, 0, 2, 23, 59)),
    "2026-01-02",
  );
});

test("local date follows both sides of UTC midnight without toISOString day shifts", () => {
  const url = new URL("../src/components/crf/calculations.ts", import.meta.url)
    .href;
  const script = `import {getLocalCalendarDate} from ${JSON.stringify(url)}; process.stdout.write(getLocalCalendarDate(new Date('2026-10-23T22:30:00Z')))`;
  for (const [zone, expected] of [
    ["Pacific/Kiritimati", "2026-10-24"],
    ["America/Los_Angeles", "2026-10-23"],
  ]) {
    const actual = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: zone } },
    );
    assert.equal(actual, expected);
  }
});

test("BMI is numeric, rounded to one decimal, recomputed and cleared for missing or nonpositive measurements", () => {
  assert.equal(calculateBmi("80", "180"), 24.7);
  assert.equal(calculateBmi("90", "180"), 27.8);
  assert.equal(calculateBmi("80", "160"), 31.3);
  for (const [weight, height] of [
    ["", "180"],
    ["80", ""],
    ["0", "180"],
    ["80", "0"],
    ["-80", "180"],
    ["80", "-180"],
    ["NaN", "180"],
    ["80", "Infinity"],
  ])
    assert.equal(calculateBmi(weight, height), null);
  const draft = createNewCrf();
  draft.weight = "80";
  draft.height = "180";
  draft.bmi = 999;
  assert.equal(toCrfValues(draft).bmi, 24.7);
  draft.height = "";
  assert.equal(recalculateDerived(draft).bmi, null);
});

test("duration model preserves numeric years, months and total months including blank years normalized to zero", () => {
  for (const [years, months, total, label] of [
    ["3", "4", 40, "3 yıl 4 aydır"],
    ["0", "4", 4, "0 yıl 4 aydır"],
    ["", "4", 4, "0 yıl 4 aydır"],
    ["1", "0", 12, "1 yıl 0 aydır"],
    ["0", "0", 0, "0 yıl 0 aydır"],
  ] as const) {
    const draft = createNewCrf();
    draft.treatmentDurationYears = years;
    draft.treatmentDurationMonths = months;
    const values = toCrfValues(draft);
    assert.equal(values.treatmentDurationYears, Number(years));
    assert.equal(values.treatmentDurationMonths, Number(months));
    assert.equal(values.treatmentDurationTotalMonths, total);
    assert.equal(describeTreatmentDuration(years, months), label);
  }
});

test("duration bounds reject invalid values, keep both blanks empty, and do not invent a total for missing months", () => {
  const year = field("treatmentDurationYears"),
    month = field("treatmentDurationMonths");
  for (const value of ["-1", "1.5", "Infinity", "100000000000000000"])
    assert(validateField(year, value));
  for (const value of ["-1", "12", "1.5", "NaN"])
    assert(validateField(month, value));
  assert.equal(validateField(year, "0"), undefined);
  assert.equal(validateField(month, "11"), undefined);
  assert.equal(validateField(month, ""), undefined);

  assert.deepEqual(getTreatmentDuration("", "4"), {
    years: 0,
    months: 4,
    totalMonths: 4,
  });
  assert.equal(describeTreatmentDuration("", "4"), "0 yıl 4 aydır");
  assert.equal(getTreatmentDuration("", ""), null);
  assert.equal(describeTreatmentDuration("", ""), "");

  for (const [years, months] of [
    ["3", ""],
    ["-1", "4"],
    ["3", "12"],
  ]) {
    assert.equal(getTreatmentDuration(years, months), null);
    assert.equal(describeTreatmentDuration(years, months), "");
  }
  const draft = createNewCrf();
  draft.treatmentDurationYears = "3";
  draft.treatmentDurationMonths = "12";
  assert(validatePublicCrf(draft).treatmentDurationMonths);
  assert.equal(toCrfValues(draft).treatmentDurationTotalMonths, null);
});
