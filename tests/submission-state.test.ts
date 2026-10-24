import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmissionController } from "../src/services/submissionState.ts";

test("a double click joins one pending save; success replay does not allocate again", async () => {
  let calls = 0,
    ids = 0;
  let resolve!: (value: string) => void;
  const pending = new Promise<string>((done) => {
    resolve = done;
  });
  const controller = createSubmissionController(
    async () => {
      calls++;
      return pending;
    },
    () => `request-${++ids}`,
  );
  const first = controller.submit({ value: "original" });
  const second = controller.submit({ value: "changed" });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve("AHT-000");
  assert.equal(await first, "AHT-000");
  assert.equal(await controller.submit({ value: "other" }), "AHT-000");
  assert.equal(calls, 1);
  assert.equal(ids, 1);
});

test("failed or ambiguous save freezes original answers and retries the same request, not a new form", async () => {
  let count = 0;
  const requests: { id: string; value: string }[] = [];
  const controller = createSubmissionController(
    async (snapshot: { value: string }, id) => {
      requests.push({ id, value: snapshot.value });
      if (++count === 1) throw Error("simulated connection loss");
      return "AHT-000";
    },
    () => "stable-request",
  );
  const input = { value: "first snapshot" };
  await assert.rejects(controller.submit(input));
  input.value = "edited afterwards";
  assert.equal(await controller.submit(input), "AHT-000");
  assert.deepEqual(requests, [
    { id: "stable-request", value: "first snapshot" },
    { id: "stable-request", value: "first snapshot" },
  ]);
  const printable = controller.snapshot!;
  printable.value = "mutated copy";
  assert.equal(controller.snapshot!.value, "first snapshot");
});
