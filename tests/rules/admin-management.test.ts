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
import { allocateSubject } from "../../src/services/registrationCore.ts";
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
const allocate = (db: Firestore, uid: string, number: number) =>
  retryRegistration(
    () =>
      allocateSubject(
        createRegistrationStore(db),
        uid,
        request(number),
        publicValues(),
      ),
    async () => {},
  );
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
});
test("full edit updates clinical data but preserves identity, counter and receipt; public/non-admin denied", async () => {
  const result = await allocate(anon(), "collector", 1);
  const db = admin();
  const ref = doc(db, "subjects", result.subjectId);
  const before = (await getDoc(ref)).data()!;
  const values = { ...publicValues(), researchNotes: "SYNTHETIC EDIT" };
  const patch = {
    publicValues: values,
    investigations: investigationValues(createEmptyCrf()),
    status: "pending_completion",
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
  for (const identity of [
    { subjectCode: "AHT-999" },
    { subjectNumber: 999 },
    { createdAt: serverTimestamp() },
    { createdByUid: "other" },
    { requestId: request(99) },
  ])
    await assertFails(updateDoc(ref, { ...patch, ...identity }));
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
test("admin deletion atomically revokes receipt and releases code; anonymous/non-admin/stale-auth cannot delete", async () => {
  const result = await allocate(anon(), "collector", 1);
  for (const denied of [anon(), admin("not-admin"), admin("admin", 600)])
    await assertFails(deleteSubjectTransaction(denied, result.subjectId));
  await assertSucceeds(deleteSubjectTransaction(admin(), result.subjectId));
  assert(!(await getDoc(doc(admin(), "subjects", result.subjectId))).exists());
  assert.deepEqual(
    (await getDoc(doc(admin(), "systemCounters/reusableSubjects"))).data()!
      .numbers,
    [0],
  );
  await assertFails(
    getDoc(doc(anon(), "submissionRequests/collector/requests", request(1))),
  );
  await assert.rejects(allocate(anon(), "collector", 1));
  const next = await allocate(anon("new"), "new", 2);
  assert.equal(next.subjectCode, "AHT-000");
  assert.notEqual(next.subjectId, result.subjectId);
  assert.equal(
    (await getDoc(doc(admin(), "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    0,
  );
});
test("smallest free code is consumed exactly once under real concurrent allocation; sequential resumes", async () => {
  const records = [];
  for (let i = 0; i < 5; i++)
    records.push(await allocate(anon("initial"), "initial", i + 1));
  await deleteSubjectTransaction(admin(), records[4]!.subjectId);
  await deleteSubjectTransaction(admin(), records[2]!.subjectId);
  assert.deepEqual(
    (await getDoc(doc(admin(), "systemCounters/reusableSubjects"))).data()!
      .numbers,
    [2, 4],
  );
  const results = await Promise.all([
    allocate(anon("a"), "a", 20),
    allocate(anon("b"), "b", 21),
  ]);
  assert.deepEqual(
    results.map((result) => result.subjectNumber).sort((a, b) => a - b),
    [2, 4],
  );
  assert.notEqual(results[0]!.subjectId, results[1]!.subjectId);
  const next = await allocate(anon("c"), "c", 22);
  assert.equal(next.subjectNumber, 5);
  const codes = (await getDocs(collection(admin(), "subjects"))).docs.map(
    (item) => item.data().subjectCode,
  );
  assert.equal(new Set(codes).size, codes.length);
});
test("pool cannot be forged or consumed without allocation; deletion cannot mutate a different subject", async () => {
  const one = await allocate(anon(), "collector", 1);
  const two = await allocate(anon(), "collector", 2);
  for (const denied of [anon(), admin("not-admin"), admin()]) {
    await assertFails(
      setDoc(doc(denied, "systemCounters/reusableSubjects"), {
        numbers: [0],
        lastSubjectId: one.subjectId,
        operation: "release",
        insertIndex: 0,
      }),
    );
    await assertFails(deleteDoc(doc(denied, "subjects", one.subjectId)));
  }
  const batch = writeBatch(admin());
  batch.set(doc(admin(), "systemCounters/reusableSubjects"), {
    numbers: [0],
    lastSubjectId: one.subjectId,
    operation: "release",
    insertIndex: 0,
  });
  batch.update(
    doc(admin(), "submissionRequests/collector/requests", request(1)),
    { revoked: true },
  );
  batch.delete(doc(admin(), "subjects", one.subjectId));
  batch.update(doc(admin(), "subjects", two.subjectId), { subjectNumber: 0 });
  await assertFails(batch.commit());
  assert((await getDoc(doc(admin(), "subjects", one.subjectId))).exists());
});
