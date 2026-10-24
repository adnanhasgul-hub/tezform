import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyCrf } from "../src/components/crf/sections.ts";
import {
  investigationValues,
  investigationSection,
  investigationState,
  recordStatus,
} from "../src/services/adminModel.ts";
import { reauthenticatedDelete } from "../src/services/adminDeletion.ts";
import {
  readFreeNumbers,
  releaseNumber,
} from "../src/services/reusableNumbers.ts";
test("Section 4 states use all canonical fields and real values, including whitespace and arrays", () => {
  const empty = investigationValues(createEmptyCrf());
  assert.equal(Object.keys(empty).length, 21);
  assert.equal(investigationState({}), "empty");
  assert.equal(investigationState({ ...empty, bun: "  " }), "empty");
  assert.equal(investigationState({ ...empty, bun: "0" }), "partial");
  const complete = { ...empty };
  for (const field of investigationSection.fields) {
    if (field.kind === "multiselect") complete[field.id] = [field.options[0]!];
    else
      complete[
        field.id as Exclude<keyof typeof complete, "dvtSide" | "dvtLocations">
      ] = "1";
  }
  assert.equal(investigationState(complete), "complete");
  assert.equal(recordStatus(complete), "completed");
  assert.equal(investigationState({ ...complete, egfr: "" }), "partial");
  assert.equal(recordStatus({ ...complete, egfr: "" }), "pending_completion");
  assert.equal(investigationState({ ...empty, dvtSide: ["Sağ"] }), "partial");
});
test("fresh Firebase reauthentication is required before any delete operation starts", async () => {
  let calls = 0;
  await assert.rejects(
    reauthenticatedDelete(
      "synthetic-invalid",
      async () => {
        throw new Error("synthetic auth rejection");
      },
      async () => {
        calls++;
      },
    ),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    reauthenticatedDelete(
      "",
      async () => {},
      async () => {
        calls++;
      },
    ),
  );
  assert.equal(calls, 0);
  const order: string[] = [];
  await reauthenticatedDelete(
    "synthetic",
    async () => {
      order.push("auth");
    },
    async () => {
      order.push("delete");
    },
  );
  assert.deepEqual(order, ["auth", "delete"]);
});
test("reusable pool preserves sorted unique numbers and rejects malformed state", () => {
  assert.deepEqual(releaseNumber([2, 4], 3), [2, 3, 4]);
  assert.deepEqual(releaseNumber([], 0), [0]);
  for (const invalid of [[2, 2], [4, 2], [-1], [0.5]])
    assert.throws(() => readFreeNumbers(invalid));
  assert.throws(() => releaseNumber([2], 2));
  assert.deepEqual(readFreeNumbers(null), []);
});

test('Rules Section 4 schema matches canonical metadata without drifting', async()=>{
  const {readFileSync}=await import('node:fs');
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const body=rules.split('function validInvestigations(data)')[1]!;
  const list=/data\.keys\(\)\.hasAll\(\[([^\]]+)\]\)/.exec(body)![1]!;
  const ids=[...list.matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(ids.sort(),investigationSection.fields.map(field=>field.id).sort());
});
