import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEmptyCrf,
  crfSections,
  getFieldForDisplay,
} from "../src/components/crf/sections.ts";
import {
  ambiguousLegacyLocations,
  clearInactiveDvt,
  normalizeDvt,
  resolvedDvt,
} from "../src/services/dvtModel.ts";
import {
  createAdminRecordDraft,
  investigationState,
  investigationValues,
} from "../src/services/adminModel.ts";
import type { InvestigationValues } from "../src/types/crf.ts";

const section = crfSections.find((item) => item.number === 4)!;
const display = (
  values = createEmptyCrf(),
  context: "digital" | "print" = "digital",
) =>
  section.fields.flatMap((field) => {
    const result = getFieldForDisplay(field, values, context);
    return result ? [result] : [];
  });
function completeLabs(): InvestigationValues {
  return Object.fromEntries(
    section.fields.map((field) => [
      field.id,
      field.kind === "multiselect" ? [] : "1",
    ]),
  ) as InvestigationValues;
}

test("side-first DVT presentation hides locations until selected, numbers one side as 2 and bilateral as 2A/2B", () => {
  const values = createEmptyCrf();
  assert(!display(values).some((field) => field.id.includes("Locations")));
  values.dvtSide = ["Sağ"];
  assert.equal(
    display(values).find((field) => field.id === "dvtRightLocations")?.label,
    "2. Sağ DVT Lokalizasyonu",
  );
  assert(!display(values).some((field) => field.id === "dvtLeftLocations"));
  values.dvtSide = ["Sol"];
  assert.equal(
    display(values).find((field) => field.id === "dvtLeftLocations")?.label,
    "2. Sol DVT Lokalizasyonu",
  );
  values.dvtSide = ["Sağ", "Sol"];
  assert.equal(
    display(values).find((field) => field.id === "dvtRightLocations")?.label,
    "2A. Sağ DVT Lokalizasyonu",
  );
  assert.equal(
    display(values).find((field) => field.id === "dvtLeftLocations")?.label,
    "2B. Sol DVT Lokalizasyonu",
  );
  assert.equal(
    display(createEmptyCrf(), "print").filter((field) =>
      field.id.includes("Locations"),
    ).length,
    2,
  );
});

test("right/left answers are independent; inactive answers are removed at the final persistence boundary", () => {
  const values = createEmptyCrf();
  values.dvtSide = ["Sağ", "Sol"];
  values.dvtRightLocations = ["Femoral", "Popliteal"];
  values.dvtLeftLocations = ["İliak"];
  assert.deepEqual(investigationValues(values).dvtRightLocations, [
    "Femoral",
    "Popliteal",
  ]);
  values.dvtSide = ["Sol"];
  assert.deepEqual(investigationValues(values).dvtRightLocations, []);
  assert.deepEqual(investigationValues(values).dvtLeftLocations, ["İliak"]);
  const cleared = clearInactiveDvt(values);
  assert.deepEqual(cleared.dvtRightLocations, []);
  assert.deepEqual(values.dvtRightLocations, ["Femoral", "Popliteal"]);
  values.dvtSide = [];
  assert.deepEqual(investigationValues(values).dvtLeftLocations, []);
  assert(!("dvtLocations" in investigationValues(values)));
});

test("legacy unilateral locations map safely; bilateral shared locations remain ambiguous without guessing", () => {
  assert.deepEqual(
    normalizeDvt({ dvtSide: ["Sağ"], dvtLocations: ["Popliteal"] }),
    {
      dvtSide: ["Sağ"],
      dvtRightLocations: ["Popliteal"],
      dvtLeftLocations: [],
    },
  );
  assert.deepEqual(
    normalizeDvt({ dvtSide: ["Sol"], dvtLocations: ["İliak"] })
      .dvtLeftLocations,
    ["İliak"],
  );
  const legacy = { dvtSide: ["Sağ", "Sol"], dvtLocations: ["Femoral"] };
  assert.deepEqual(ambiguousLegacyLocations(legacy), ["Femoral"]);
  assert.deepEqual(normalizeDvt(legacy).dvtRightLocations, []);
  assert.deepEqual(normalizeDvt(legacy).dvtLeftLocations, []);
  const publicValues = Object.fromEntries(
    crfSections
      .filter((item) => item.entryRole === "public")
      .flatMap((item) =>
        item.fields.map((field) => [field.id, createEmptyCrf()[field.id]]),
      ),
  ) as Parameters<typeof createAdminRecordDraft>[0]["publicValues"];
  const draft = createAdminRecordDraft({
    publicValues,
    investigations: legacy,
  });
  assert.deepEqual(draft.legacyDvtLocations, ["Femoral"]);
  assert(!("dvtLocations" in draft));
  assert(!("legacyDvtLocations" in investigationValues(draft)));
});

test("completion requires locations only for selected sides while all 19 lab requirements remain unchanged", () => {
  const values = completeLabs();
  assert.equal(investigationState({}), "empty");
  assert.equal(investigationState(values), "partial");
  values.dvtSide = ["Sağ"];
  assert.equal(investigationState(values), "partial");
  values.dvtRightLocations = ["Femoral"];
  assert.equal(investigationState(values), "complete");
  values.dvtSide = ["Sağ", "Sol"];
  assert.equal(investigationState(values), "partial");
  values.dvtLeftLocations = ["İliak"];
  assert.equal(investigationState(values), "complete");
  assert(resolvedDvt({ ...createEmptyCrf(), ...values }));
  values.bun = "  ";
  assert.equal(investigationState(values), "partial");
  const legacy = {
    ...completeLabs(),
    dvtSide: ["Sağ", "Sol"],
    dvtLocations: ["Popliteal"],
  };
  delete (legacy as Partial<InvestigationValues>).dvtRightLocations;
  delete (legacy as Partial<InvestigationValues>).dvtLeftLocations;
  assert.equal(investigationState(legacy), "partial");
});
