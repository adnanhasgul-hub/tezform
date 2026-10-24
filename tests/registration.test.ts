import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createNewCrf,
  publicSections,
} from "../src/components/crf/sections.ts";
import {
  allocateSubject,
  formatSubjectCode,
  isRequestId,
  preparePublicValues,
} from "../src/services/registrationCore.ts";
import type {
  CounterDocument,
  RegistrationResult,
  RegistrationStore,
  RegistrationTransaction,
  SubjectDocument,
} from "../src/services/registrationCore.ts";

const requestA = "00000000-0000-4000-8000-000000000001";
const requestB = "00000000-0000-4000-8000-000000000002";

// A serial atomic test port, not a substitute for the Firestore Rules emulator.
class AtomicMemoryStore implements RegistrationStore {
  counter: unknown | null = { lastAllocatedNumber: -1 };
  subjects = new Map<string, SubjectDocument>();
  receipts = new Map<string, RegistrationResult>();
  ids = 0;
  transactions = 0;
  failCommit = false;
  private tail: Promise<unknown> = Promise.resolve();

  newSubjectId() {
    return String(++this.ids).padStart(20, "0");
  }
  timestamp() {
    return "test-server-timestamp";
  }
  runTransaction<T>(
    operation: (transaction: RegistrationTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactions++;
    const run = this.tail.then(async () => {
      const writes: (() => void)[] = [];
      const result = await operation({
        getReceipt: async (uid, id) =>
          this.receipts.get(`${uid}/${id}`) ?? null,
        getCounter: async () => this.counter,
        createSubject: (id, data) =>
          writes.push(() => {
            this.subjects.set(id, structuredClone(data));
          }),
        createReceipt: (uid, id, receipt) =>
          writes.push(() => {
            this.receipts.set(`${uid}/${id}`, { ...receipt });
          }),
        updateCounter: (counter: CounterDocument) =>
          writes.push(() => {
            this.counter = { ...counter };
          }),
      });
      if (this.failCommit) throw new Error("Test commit failure");
      writes.forEach((write) => write());
      return result;
    });
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function createCompletePublicDraft() {
  const draft = createNewCrf(new Date(2026, 9, 24));
  for (const field of publicSections.flatMap((section) => section.fields)) {
    if (
      field.readOnly ||
      field.when ||
      field.id === "bleedingOnsetInterval" ||
      field.id === "researchNotes"
    )
      continue;
    if (field.kind === "multiselect") {
      draft[field.id] = [
        field.options.find((option) => option === "Hiçbiri") ??
          field.options.find((option) => option === "Hayır") ??
          field.options[0]!,
      ];
    } else if (field.kind === "radio" || field.kind === "select") {
      draft[field.id] =
        field.options.find((option) => option === "Hayır") ??
        field.options.find((option) => option === "Kanama olmadı / Uygulanamaz") ??
        field.options[0]!;
    } else if (field.kind === "date") {
      draft[field.id] = "2026-10-24";
    } else if (field.kind === "time") {
      draft[field.id] = "12:30";
    } else if (field.kind === "number") {
      draft[field.id] = "1";
    } else {
      draft[field.id] = "TEST";
    }
  }
  draft.weight = "80";
  draft.height = "180";
  draft.treatmentDurationYears = "3";
  draft.treatmentDurationMonths = "4";
  return draft;
}

const values = () => preparePublicValues(createCompletePublicDraft());

test("AHT numbering starts at zero and expands beyond three digits without truncating", () => {
  for (const [number, expected] of [
    [0, "AHT-000"],
    [1, "AHT-001"],
    [9, "AHT-009"],
    [27, "AHT-027"],
    [999, "AHT-999"],
    [1000, "AHT-1000"],
  ] as const)
    assert.equal(formatSubjectCode(number), expected);
  for (const bad of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => formatSubjectCode(bad));
  assert(isRequestId(requestA));
  assert(!isRequestId("not-a-request"));
  assert(!isRequestId("00000000-0000-1000-8000-000000000001"));
});

test("two concurrent successful submissions receive different codes and immutable pending records", async () => {
  const store = new AtomicMemoryStore();
  const [first, second] = await Promise.all([
    allocateSubject(store, "anonymous-a", requestA, values()),
    allocateSubject(store, "anonymous-b", requestB, values()),
  ]);
  assert.equal(first.subjectCode, "AHT-000");
  assert.equal(second.subjectCode, "AHT-001");
  assert.notEqual(first.subjectId, second.subjectId);
  assert.equal(store.subjects.size, 2);
  assert.equal(store.receipts.size, 2);
  const saved = store.subjects.get(first.subjectId)!;
  assert.equal(saved.status, "pending_completion");
  assert.equal(saved.createdAt, "test-server-timestamp");
  assert.equal(saved.updatedAt, saved.createdAt);
  assert.equal(saved.createdByUid, "anonymous-a");
  assert.deepEqual(saved.investigations, {});
  assert.equal((store.counter as CounterDocument).lastAllocatedNumber, 1);
});

test("double submission and later retry of the same owner/request return one subject and original receipt", async () => {
  const store = new AtomicMemoryStore();
  const [first, second] = await Promise.all([
    allocateSubject(store, "same-owner", requestA, values()),
    allocateSubject(store, "same-owner", requestA, values()),
  ]);
  assert.deepEqual(second, first);
  const retry = await allocateSubject(store, "same-owner", requestA, values());
  assert.deepEqual(retry, first);
  assert.equal(store.subjects.size, 1);
  assert.equal(store.receipts.size, 1);
  assert.equal((store.counter as CounterDocument).lastAllocatedNumber, 0);
});

test("failed atomic commit exposes no success, consumes no code and can retry with the same request", async () => {
  const store = new AtomicMemoryStore();
  store.failCommit = true;
  await assert.rejects(allocateSubject(store, "owner", requestA, values()));
  assert.equal(store.subjects.size, 0);
  assert.equal(store.receipts.size, 0);
  assert.deepEqual(store.counter, { lastAllocatedNumber: -1 });
  store.failCommit = false;
  const retry = await allocateSubject(store, "owner", requestA, values());
  assert.equal(retry.subjectCode, "AHT-000");
});

test("missing, decremented-invalid and exhausted counter values are never silently initialized", async () => {
  for (const counter of [
    null,
    {},
    { lastAllocatedNumber: -2 },
    { lastAllocatedNumber: 1.5 },
    { lastAllocatedNumber: Number.MAX_SAFE_INTEGER },
  ]) {
    const store = new AtomicMemoryStore();
    store.counter = counter;
    await assert.rejects(allocateSubject(store, "owner", requestA, values()));
    assert.equal(store.subjects.size, 0);
    assert.equal(store.receipts.size, 0);
  }
});

test("a removed subject never releases its code and a receipt retry does not recreate it", async () => {
  const store = new AtomicMemoryStore();
  const first = await allocateSubject(store, "owner", requestA, values());
  store.subjects.delete(first.subjectId); // Console/admin deletion simulation; clients have no delete permission.
  assert.deepEqual(
    await allocateSubject(store, "owner", requestA, values()),
    first,
  );
  assert.equal(store.subjects.size, 0);
  const next = await allocateSubject(store, "owner", requestB, values());
  assert.equal(next.subjectCode, "AHT-001");
});

test("write payload keeps all public and conditional answers, numeric calculations, and excludes admin data", () => {
  const draft = createCompletePublicDraft();
  draft.nationalId = "UI-DEMO";
  draft.weight = "80";
  draft.height = "180";
  draft.treatmentDurationYears = "3";
  draft.treatmentDurationMonths = "4";
  draft.epistaxis = "Evet ->";
  draft.epistaxisFrequency = "Haftalık";
  draft.epistaxisDuration = ">10 dk";
  draft.dvtLocations = ["İliak"];
  draft.hemoglobin = "13";
  draft.otherAntithrombotic = ["Heparin"];
  const prepared = preparePublicValues(draft);
  assert.equal(prepared.bmi, 24.7);
  assert.equal(prepared.treatmentDurationYears, 3);
  assert.equal(prepared.treatmentDurationMonths, 4);
  assert.equal(prepared.treatmentDurationTotalMonths, 40);
  assert.equal(prepared.epistaxisFrequency, "Haftalık");
  assert.equal(prepared.epistaxisDuration, ">10 dk");
  assert(!("dvtLocations" in prepared));
  assert(!("hemoglobin" in prepared));
  assert(!("assessmentDate" in prepared));
  assert.equal(
    Object.keys(prepared).length,
    publicSections.flatMap((section) => section.fields).length + 1,
  );
  draft.otherAntithrombotic.push("Aspirin");
  assert.deepEqual(prepared.otherAntithrombotic, ["Heparin"]);
});

test("invalid input and malformed receipt reject rather than inventing a code or success", async () => {
  const draft = createCompletePublicDraft();
  draft.treatmentDurationMonths = "12";
  assert.throws(() => preparePublicValues(draft));
  const store = new AtomicMemoryStore();
  store.receipts.set(`owner/${requestA}`, {
    subjectId: "1",
    subjectCode: "AHT-000",
    subjectNumber: 0,
    requestId: requestA,
  });
  await assert.rejects(allocateSubject(store, "owner", requestA, values()));
  await assert.rejects(
    allocateSubject(new AtomicMemoryStore(), "owner", "bad-request", values()),
  );
});

test("Rules public-data whitelist stays in sync with the metadata-derived write payload", () => {
  const rules = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8",
  );
  const validPublic = rules.split("function validPublic(data)")[1]!;
  const match = /data\.keys\(\)\.hasAll\((\[[^\]]+\])\)/.exec(validPublic);
  assert(match, "Rules must explicitly whitelist the public model keys");
  assert.deepEqual(
    (JSON.parse(match[1]!) as string[]).sort(),
    Object.keys(values()).sort(),
  );
});
