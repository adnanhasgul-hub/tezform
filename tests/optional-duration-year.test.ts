import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEmptyCrf,
  publicSections,
} from "../src/components/crf/sections.ts";
import {
  isPublicFieldRequired,
  validatePublicCrf,
} from "../src/components/crf/validation.ts";

const fields = publicSections.flatMap((section) => section.fields);
const field = (id: string) => {
  const result = fields.find((item) => item.id === id);
  assert(result);
  return result;
};

test("Apixaban duration year is optional while month remains required", () => {
  const values = createEmptyCrf();
  const errors = validatePublicCrf(values);

  assert.equal(isPublicFieldRequired(field("treatmentDurationYears")), false);
  assert.equal(errors.treatmentDurationYears, undefined);

  assert.equal(isPublicFieldRequired(field("treatmentDurationMonths")), true);
  assert.equal(errors.treatmentDurationMonths, "Bu alan zorunludur.");
});
