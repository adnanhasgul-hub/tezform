import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { createRegistrationStore } from "../../src/services/registrationStore.ts";
import {
  allocateSubject,
  preparePublicValues,
} from "../../src/services/registrationCore.ts";
import { retryRegistration } from "../../src/services/registrationRetry.ts";
import { deleteSubjectTransaction } from "../../src/services/adminStore.ts";
import {
  createEmptyCrf,
  publicSections,
} from "../../src/components/crf/sections.ts";
import { toCrfValues } from "../../src/components/crf/calculations.ts";
import {
  investigationValues,
  investigationSection,
} from "../../src/services/adminModel.ts";
import type { PublicCrfValues } from "../../src/types/crf.ts";
let env: RulesTestEnvironment;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  assert(address, "Emulator required");
  const [host, port] = address.split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-tezform-rules",
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "admins/admin"), {});
    await setDoc(doc(ctx.firestore(), "systemCounters/subjects"), {
      lastAllocatedNumber: -1,
    });
  });
});
const anon = (uid = "collector") =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();
const admin = (uid = "admin", age = 0) =>
  env
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: "password" },
      auth_time: Math.floor(Date.now() / 1000) - age,
    })
    .firestore();
function publicValues(): PublicCrfValues {
  const all = toCrfValues(createEmptyCrf());
  return {
    ...Object.fromEntries(
      publicSections.flatMap((section) =>
        section.fields.map((field) => [field.id, all[field.id]]),
      ),
    ),
    treatmentDurationTotalMonths: null,
  } as PublicCrfValues;
}
const request = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
async function allocate(
  db: Firestore,
  uid: string,
  number: number,
  values = publicValues(),
  afterCounterRead?: (lastAllocatedNumber: number) => Promise<void>,
) {
  const store = createRegistrationStore(db);
  let lastFailure: unknown;
  try {
    return await retryRegistration(async () => {
      try {
        return await allocateSubject(
          {
            ...store,
            runTransaction: (operation) =>
              store.runTransaction((transaction) =>
                operation({
                  ...transaction,
                  getCounter: async () => {
                    const counter = await transaction.getCounter();
                    await afterCounterRead?.(
                      (counter as { lastAllocatedNumber: number })
                        .lastAllocatedNumber,
                    );
                    return counter;
                  },
                }),
              ),
          },
          uid,
          request(number),
          values,
        );
      } catch (error) {
        lastFailure = error;
        throw error;
      }
    });
  } catch (error) {
    // Synthetic emulator fixtures only; preserve the underlying Rules denial in CI.
    throw new Error(`Synthetic allocation ${uid}/${number} failed`, {
      cause: lastFailure ?? error,
    });
  }
}

function fullInvestigations() {
  const values = investigationValues(createEmptyCrf());
  for (const field of investigationSection.fields) {
    if (field.kind === "multiselect") values[field.id] = [field.options[0]!];
    else
      values[
        field.id as Exclude<keyof typeof values, "dvtSide" | "dvtLocations">
      ] = "1";
  }
  return values;
}
test("partial Section 4 saves retain values and correctly transition complete -> partial -> empty", async () => {
  const result = await allocate(anon(), "collector", 1);
  const db = admin();
  const ref = doc(db, "subjects", result.subjectId);
  const partial = { ...investigationValues(createEmptyCrf()), bun: "15" };
  await assertSucceeds(
    updateDoc(ref, {
      investigations: partial,
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }),
  );
  assert.deepEqual((await getDoc(ref)).data()!.investigations, partial);
  await assertSucceeds(
    updateDoc(ref, {
      investigations: fullInvestigations(),
      status: "completed",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      investigations: partial,
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      investigations: investigationValues(createEmptyCrf()),
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, { status: "completed", updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      investigations: { ...fullInvestigations(), bun: "\u00a0" },
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }),
  );
});
test("full edit updates clinical data but preserves identity, counter and receipt; public/non-admin denied", async () => {
  const result = await allocate(anon(), "collector", 1);
  const db = admin();
  const ref = doc(db, "subjects", result.subjectId);
  const before = (await getDoc(ref)).data()!;
  const values = {
    ...publicValues(),
    researchNotes: "SYNTHETIC EDIT",
    bmi: 24.7,
    treatmentDurationYears: 3,
    treatmentDurationMonths: 4,
    treatmentDurationTotalMonths: 40,
  };
  const patch = {
    publicValues: values,
    investigations: fullInvestigations(),
    status: "completed",
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(updateDoc(ref, patch));
  const after = (await getDoc(ref)).data()!;
  assert.equal(after.publicValues.researchNotes, "SYNTHETIC EDIT");
  for (const key of [
    "subjectCode",
    "subjectNumber",
    "createdAt",
    "createdByUid",
    "requestId",
  ])
    assert.deepEqual(after[key], before[key]);
  assert.equal(
    (await getDoc(doc(db, "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    0,
  );
  assert.equal((await getDocs(collection(db, "subjects"))).size, 1);
  const counterRef = doc(db, "systemCounters/subjects");
  const counterBefore = (await getDoc(counterRef)).data();
  const counterMutation = writeBatch(db);
  counterMutation.update(ref, {
    ...patch,
    publicValues: { ...values, researchNotes: "FORGED COUNTER EDIT" },
  });
  counterMutation.update(counterRef, { lastAllocatedNumber: 1 });
  await assertFails(counterMutation.commit());
  assert.deepEqual((await getDoc(counterRef)).data(), counterBefore);
  assert.equal(
    (await getDoc(ref)).data()!.publicValues.researchNotes,
    "SYNTHETIC EDIT",
  );
  for (const identity of [
    { subjectCode: "AHT-999" },
    { subjectNumber: 999 },
    { createdAt: serverTimestamp() },
    { createdByUid: "other" },
    { requestId: request(99) },
  ])
    await assertFails(updateDoc(ref, { ...patch, ...identity }));
  for (const key of [
    "bmi",
    "treatmentDurationYears",
    "treatmentDurationMonths",
    "treatmentDurationTotalMonths",
  ]) {
    const invalid: Record<string, unknown> = {
      ...values,
      extra: "not allowed",
    };
    delete invalid[key];
    await assertFails(updateDoc(ref, { ...patch, publicValues: invalid }));
  }
  for (const denied of [anon(), admin("not-admin")])
    await assertFails(
      updateDoc(doc(denied, "subjects", result.subjectId), patch),
    );
  assert.equal(
    (
      await getDoc(
        doc(anon(), "submissionRequests/collector/requests", request(1)),
      )
    ).data()!.subjectId,
    result.subjectId,
  );
});
test("admin deletion atomically revokes receipt without changing counter; anonymous/non-admin/stale-auth cannot delete", async () => {
  const result = await allocate(anon(), "collector", 1);
  const counter = doc(admin(), "systemCounters/subjects");
  const before = (await getDoc(counter)).data();
  for (const denied of [anon(), admin("not-admin"), admin("admin", 600)])
    await assertFails(deleteSubjectTransaction(denied, result.subjectId));
  await assertSucceeds(deleteSubjectTransaction(admin(), result.subjectId));
  assert(!(await getDoc(doc(admin(), "subjects", result.subjectId))).exists());
  assert.deepEqual((await getDoc(counter)).data(), before);
  await assertFails(
    getDoc(doc(anon(), "submissionRequests/collector/requests", request(1))),
  );
  await assert.rejects(allocate(anon(), "collector", 1));
  const next = await allocate(anon("new"), "new", 2);
  assert.equal(next.subjectCode, "AHT-001");
  assert.notEqual(next.subjectId, result.subjectId);
  assert.equal((await getDoc(counter)).data()!.lastAllocatedNumber, 1);
});
test("deleting highest allocations leaves gaps; concurrent collectors continue strictly above the high-water mark", async () => {
  const records = [];
  for (let i = 0; i < 4; i++)
    records.push(await allocate(anon("initial"), "initial", i + 1));
  const counterRef = doc(admin(), "systemCounters/subjects");
  const before = (await getDoc(counterRef)).data();
  await deleteSubjectTransaction(admin(), records[2]!.subjectId);
  await deleteSubjectTransaction(admin(), records[3]!.subjectId);
  assert.deepEqual((await getDoc(counterRef)).data(), before);
  const bothRead = Promise.withResolvers<void>();
  let initialReads = 0;
  let transactionAttempts = 0;
  function synchronizeFirstRead() {
    let firstAttempt = true;
    return async (lastAllocatedNumber: number) => {
      transactionAttempts++;
      if (!firstAttempt) return;
      firstAttempt = false;
      assert.equal(lastAllocatedNumber, 3);
      if (++initialReads === 2) bothRead.resolve();
      await bothRead.promise;
    };
  }
  const outcomes = await Promise.allSettled([
    allocate(anon("a"), "a", 20, publicValues(), synchronizeFirstRead()),
    allocate(anon("b"), "b", 21, publicValues(), synchronizeFirstRead()),
  ]);
  assert(
    transactionAttempts >= 3,
    "Native/application retry resolves forced counter conflict",
  );
  const results = outcomes.map((outcome) => {
    if (outcome.status === "rejected") throw outcome.reason;
    return outcome.value;
  });
  assert.deepEqual(
    results.map((result) => result.subjectNumber).sort((a, b) => a - b),
    [4, 5],
  );
  assert.notEqual(results[0]!.subjectId, results[1]!.subjectId);
  const next = await allocate(anon("c"), "c", 22);
  assert.equal(next.subjectNumber, 6);
  assert.equal((await getDoc(counterRef)).data()!.lastAllocatedNumber, 6);
  const codes = (await getDocs(collection(admin(), "subjects"))).docs.map(
    (item) => item.data().subjectCode,
  );
  assert.deepEqual(codes.sort(), [
    "AHT-000",
    "AHT-001",
    "AHT-004",
    "AHT-005",
    "AHT-006",
  ]);
});
test("retired pool denies every client read/write; deletion cannot mutate a different subject or receipt", async () => {
  const one = await allocate(anon(), "collector", 1);
  const two = await allocate(anon(), "collector", 2);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "systemCounters/reusableSubjects"), {
      numbers: [0],
      lastSubjectId: one.subjectId,
      operation: "release",
      insertIndex: 0,
    });
  });
  for (const denied of [
    anon(),
    admin("not-admin"),
    admin(),
    env.unauthenticatedContext().firestore(),
  ]) {
    const poolRef = doc(denied, "systemCounters/reusableSubjects");
    await assertFails(getDoc(poolRef));
    await assertFails(setDoc(poolRef, { numbers: [0] }));
    await assertFails(updateDoc(poolRef, { numbers: [] }));
    await assertFails(deleteDoc(poolRef));
    await assertFails(deleteDoc(doc(denied, "subjects", one.subjectId)));
  }
  const database = admin();
  const wrongReceipt = writeBatch(database);
  wrongReceipt.update(
    doc(database, "submissionRequests/collector/requests", request(2)),
    { revoked: true },
  );
  wrongReceipt.delete(doc(database, "subjects", one.subjectId));
  await assertFails(wrongReceipt.commit());
  const forged = writeBatch(database);
  forged.update(
    doc(database, "submissionRequests/collector/requests", request(1)),
    { revoked: true, subjectNumber: 999 },
  );
  forged.delete(doc(database, "subjects", one.subjectId));
  await assertFails(forged.commit());
  const batch = writeBatch(database);
  batch.update(
    doc(database, "submissionRequests/collector/requests", request(1)),
    { revoked: true },
  );
  batch.delete(doc(database, "subjects", one.subjectId));
  batch.update(doc(database, "subjects", two.subjectId), { subjectNumber: 0 });
  await assertFails(batch.commit());
  assert((await getDoc(doc(database, "subjects", one.subjectId))).exists());
  // A legitimate deletion neither reads nor rewrites even a stale legacy pool.
  await assertSucceeds(deleteSubjectTransaction(database, one.subjectId));
  await env.withSecurityRulesDisabled(async (ctx) => {
    assert.deepEqual(
      (
        await getDoc(doc(ctx.firestore(), "systemCounters/reusableSubjects"))
      ).data()!.numbers,
      [0],
    );
  });
});

function completedPublicValues(): PublicCrfValues {
  const draft = createEmptyCrf();
  for (const field of publicSections.flatMap((section) => section.fields)) {
    if (field.readOnly) continue;
    if (field.kind === "multiselect") draft[field.id] = [field.options.at(-1)!];
    else if (field.kind === "radio" || field.kind === "select")
      draft[field.id] =
        field.options.find(
          (value) => value === "Evet ->" || value === "Diğer:",
        ) ?? field.options[0]!;
    else
      draft[field.id] =
        field.kind === "date"
          ? "2026-10-24"
          : field.kind === "time"
            ? "12:30"
            : field.kind === "number"
              ? "3"
              : "SYNTHETIC REGRESSION";
  }
  draft.weight = "80";
  draft.height = "180";
  draft.treatmentDurationYears = "3";
  draft.treatmentDurationMonths = "4";
  // Use the exact browser validation/serialization boundary, including follow-ups.
  return preparePublicValues(draft);
}
test("production-state regression: real adapter allocates complete public payload from initial/minimal/stale counters regardless of legacy pool state", async () => {
  const pools: Array<Record<string, unknown> | null> = [
    null,
    {
      numbers: [],
      lastSubjectId: "a".repeat(20),
      operation: "allocate",
      insertIndex: -1,
    },
    {
      numbers: [0, 2],
      lastSubjectId: "a".repeat(20),
      operation: "release",
      insertIndex: 1,
    },
    { numbers: "malformed retired state", unexpected: true },
  ];
  const counters = [
    { lastAllocatedNumber: -1 },
    { lastAllocatedNumber: 3 },
    {
      lastAllocatedNumber: 3,
      lastSubjectId: "z".repeat(20), // The last allocated patient no longer exists.
      lastRequestId: request(999),
      lastCreatedByUid: "deleted-collector",
    },
  ];
  const payload = completedPublicValues();
  assert.equal(Object.keys(payload).length, 50);
  assert.equal(payload.treatmentDurationTotalMonths, 40);
  for (const [counterIndex, counter] of counters.entries()) {
    for (const [poolIndex, pool] of pools.entries()) {
      const index = counterIndex * pools.length + poolIndex;
      const nextNumber = counter.lastAllocatedNumber + 1;
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "admins/admin"), {});
        await setDoc(doc(ctx.firestore(), "systemCounters/subjects"), counter);
        const ref = doc(ctx.firestore(), "systemCounters/reusableSubjects");
        if (pool === null) await deleteDoc(ref);
        else await setDoc(ref, pool);
      });
      const uid = `production-shape-${index}`;
      const result = await assertSucceeds(
        allocate(anon(uid), uid, 100 + index, payload),
      );
      assert.equal(
        result.subjectCode,
        `AHT-${String(nextNumber).padStart(3, "0")}`,
      );
      const stored = (
        await getDoc(doc(admin(), "subjects", result.subjectId))
      ).data()!;
      assert.deepEqual(stored.publicValues, payload);
      assert.equal(stored.status, "pending_completion");
      assert.equal(
        (await getDoc(doc(admin(), "systemCounters/subjects"))).data()!
          .lastAllocatedNumber,
        nextNumber,
      );
      const retried = await allocate(anon(uid), uid, 100 + index, payload);
      assert.deepEqual(retried, result);
      await env.withSecurityRulesDisabled(async (ctx) => {
        const storedPool = await getDoc(
          doc(ctx.firestore(), "systemCounters/reusableSubjects"),
        );
        assert.deepEqual(storedPool.exists() ? storedPool.data() : null, pool);
      });
    }
  }
});

test("real registration adapter preserves AHT-999 -> AHT-1000 rollover", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "systemCounters/subjects"), {
      lastAllocatedNumber: 998,
    });
    await setDoc(doc(ctx.firestore(), "systemCounters/reusableSubjects"), {
      numbers: [0, 1],
    });
  });
  const first = await allocate(
    anon(),
    "collector",
    999,
    completedPublicValues(),
  );
  const next = await allocate(
    anon(),
    "collector",
    1000,
    completedPublicValues(),
  );
  assert.equal(first.subjectCode, "AHT-999");
  assert.equal(next.subjectCode, "AHT-1000");
  assert.equal(
    (await getDoc(doc(admin(), "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    1000,
  );
});

for (const scenario of [
  {
    name: "existing AHT-000..003 and no pool -> AHT-004 then AHT-005",
    count: 4,
    deleted: [],
  },
  {
    name: "delete only AHT-002 at high-water 3 -> AHT-004 then AHT-005",
    count: 4,
    deleted: [2],
  },
  {
    name: "delete only latest AHT-004 at high-water 4 -> AHT-005",
    count: 5,
    deleted: [4],
  },
  {
    name: "delete AHT-001/003/007 from AHT-000..010 -> AHT-011",
    count: 11,
    deleted: [1, 3, 7],
  },
]) {
  test(`production-history regression: ${scenario.name}`, async () => {
    const payload = completedPublicValues();
    const records = [];
    for (let index = 0; index < scenario.count; index++) {
      const result = await allocate(
        anon("history"),
        "history",
        index + 1,
        payload,
      );
      assert.equal(result.subjectNumber, index);
      records.push(result);
    }
    const counterRef = doc(admin(), "systemCounters/subjects");
    const counterBefore = (await getDoc(counterRef)).data();
    assert.equal(counterBefore!.lastAllocatedNumber, scenario.count - 1);
    for (const number of scenario.deleted) {
      const record = records[number]!;
      const receiptRef = doc(
        admin(),
        "submissionRequests/history/requests",
        record.requestId,
      );
      const receiptBefore = (await getDoc(receiptRef)).data();
      await assertSucceeds(deleteSubjectTransaction(admin(), record.subjectId));
      assert(
        !(await getDoc(doc(admin(), "subjects", record.subjectId))).exists(),
      );
      assert.deepEqual((await getDoc(receiptRef)).data(), {
        ...receiptBefore,
        revoked: true,
      });
      assert.deepEqual((await getDoc(counterRef)).data(), counterBefore);
    }
    const first = await allocate(anon("next-one"), "next-one", 100, payload);
    const second = await allocate(anon("next-two"), "next-two", 101, payload);
    assert.equal(first.subjectNumber, scenario.count);
    assert.equal(
      first.subjectCode,
      `AHT-${String(scenario.count).padStart(3, "0")}`,
    );
    assert.equal(second.subjectNumber, scenario.count + 1);
    assert.equal(
      (await getDoc(counterRef)).data()!.lastAllocatedNumber,
      scenario.count + 1,
    );
    for (const record of [first, second]) {
      const data = (
        await getDoc(doc(admin(), "subjects", record.subjectId))
      ).data()!;
      assert.deepEqual(data.publicValues, payload);
    }
    await env.withSecurityRulesDisabled(async (ctx) => {
      assert(
        !(
          await getDoc(doc(ctx.firestore(), "systemCounters/reusableSubjects"))
        ).exists(),
        "No allocation or deletion creates a legacy pool document",
      );
    });
  });
}
