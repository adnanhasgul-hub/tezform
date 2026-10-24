import { retryRegistration } from "../../src/services/registrationRetry.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  createEmptyCrf,
  publicSections,
} from "../../src/components/crf/sections.ts";
import { toCrfValues } from "../../src/components/crf/calculations.ts";

const projectId = "demo-tezform-rules";
const firstRequest = "00000000-0000-4000-8000-000000000001";
const secondRequest = "00000000-0000-4000-8000-000000000002";
let environment: RulesTestEnvironment;

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  assert(
    address,
    "Run these tests through the Firestore emulator; no production connection is permitted.",
  );
  const [host, port] = address.split(":");
  environment = await initializeTestEnvironment({
    projectId,
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
  await environment?.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed("systemCounters/subjects", { lastAllocatedNumber: -1 });
});

async function seed(path: string, value: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), value);
  });
}
function anonymous(uid = "collector-one") {
  return environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();
}
function password(uid: string) {
  return environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
}
function publicValues() {
  const values = toCrfValues(createEmptyCrf());
  const entries = publicSections
    .flatMap((section) => section.fields)
    .map((field) => [field.id, values[field.id]]);
  return { ...Object.fromEntries(entries), treatmentDurationTotalMonths: null };
}
function subject(uid: string, requestId: string, number: number) {
  return {
    subjectCode: `AHT-${String(number).padStart(3, "0")}`,
    subjectNumber: number,
    status: "pending_completion",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: uid,
    requestId,
    publicValues: publicValues(),
    investigations: {},
  };
}
async function allocate(
  db: Firestore,
  uid: string,
  requestId: string,
  afterCounterRead?: (lastAllocatedNumber: number) => Promise<void>,
) {
  const subjectRef = doc(collection(db, "subjects"));
  const receiptRef = doc(db, `submissionRequests/${uid}/requests/${requestId}`);
  return retryRegistration(() => runTransaction(db, async (transaction) => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists()) return receipt.data();
    const counterRef = doc(db, "systemCounters/subjects");
    const counter = await transaction.get(counterRef);
    const number = counter.data()!.lastAllocatedNumber + 1;
    await afterCounterRead?.(number - 1);
    const data = subject(uid, requestId, number);
    const result = {
      subjectId: subjectRef.id,
      subjectCode: data.subjectCode,
      subjectNumber: number,
      requestId,
    };
    // Match the production allocation: put the read-version precondition first
    // so concurrent stale writes reach the SDK's native transaction retry.
    transaction.set(counterRef, {
      lastAllocatedNumber: number,
      lastSubjectId: subjectRef.id,
      lastRequestId: requestId,
      lastCreatedByUid: uid,
    });
    transaction.set(subjectRef, data);
    transaction.set(receiptRef, result);
    return result;
  }));
}

test("unauthenticated users cannot read counter/admin/subjects or create subjects", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "systemCounters/subjects")));
  await assertFails(getDoc(doc(db, "admins/anyone")));
  await assertFails(getDoc(doc(db, "subjects/aaaaaaaaaaaaaaaaaaaa")));
  await assertFails(
    setDoc(
      doc(db, "subjects/aaaaaaaaaaaaaaaaaaaa"),
      subject("anyone", firstRequest, 0),
    ),
  );
});

test("anonymous collectors allocate AHT-000 atomically and retry returns only the immutable non-PHI receipt", async () => {
  const db = anonymous();
  const first = await assertSucceeds(
    allocate(db, "collector-one", firstRequest),
  );
  assert.equal(first.subjectCode, "AHT-000");
  const retry = await assertSucceeds(
    allocate(db, "collector-one", firstRequest),
  );
  assert.deepEqual(retry, first);
  assert.equal(
    (await getDoc(doc(db, "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    0,
  );
  await assertFails(getDoc(doc(db, `subjects/${first.subjectId}`)));
  await assertFails(getDocs(collection(db, "subjects")));
  await assertFails(
    getDoc(
      doc(
        anonymous("someone-else"),
        `submissionRequests/collector-one/requests/${firstRequest}`,
      ),
    ),
  );
  await assertFails(
    getDocs(collection(db, "submissionRequests/collector-one/requests")),
  );
});

test("two concurrent collectors receive distinct sequential codes; 999 rolls over to AHT-1000", { timeout: 60_000 }, async (context) => {
  context.diagnostic("Starting concurrent allocations from counter -1");
  const bothRead = Promise.withResolvers<void>();
  let initialReads = 0;
  let transactionAttempts = 0;
  function synchronizeFirstRead() {
    let firstAttempt = true;
    return async (lastAllocatedNumber: number) => {
      transactionAttempts++;
      if (!firstAttempt) return;
      firstAttempt = false;
      assert.equal(lastAllocatedNumber, -1);
      if (++initialReads === 2) bothRead.resolve();
      await bothRead.promise;
    };
  }
  const results = await Promise.all([
    allocate(anonymous("one"), "one", firstRequest, synchronizeFirstRead()),
    allocate(anonymous("two"), "two", secondRequest, synchronizeFirstRead()),
  ]);
  assert(
    transactionAttempts >= 3,
    "Native or application retry must resolve the forced counter conflict",
  );
  assert.deepEqual(results.map((result) => result.subjectCode).sort(), [
    "AHT-000",
    "AHT-001",
  ]);
  assert.notEqual(results[0]!.subjectId, results[1]!.subjectId);
  assert.equal(
    (await getDoc(doc(anonymous(), "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    1,
  );
  context.diagnostic("Concurrent AHT-000/AHT-001 allocations passed; checking rollover");
  await seed("systemCounters/subjects", { lastAllocatedNumber: 998 });
  const lastThreeDigits = await allocate(anonymous("three"), "three", firstRequest);
  assert.equal(lastThreeDigits.subjectNumber, 999);
  assert.equal(lastThreeDigits.subjectCode, "AHT-999");
  const next = await allocate(anonymous("three"), "three", secondRequest);
  assert.equal(next.subjectNumber, 1000);
  assert.equal(next.subjectCode, "AHT-1000");
});

test("anonymous counter decrement, jump, delete, creation and standalone increment fail", async () => {
  const db = anonymous();
  const counter = doc(db, "systemCounters/subjects");
  await assertFails(updateDoc(counter, { lastAllocatedNumber: -2 }));
  await assertFails(updateDoc(counter, { lastAllocatedNumber: 9 }));
  await assertFails(
    updateDoc(counter, {
      lastAllocatedNumber: 0,
      lastSubjectId: "aaaaaaaaaaaaaaaaaaaa",
      lastRequestId: firstRequest,
      lastCreatedByUid: "collector-one",
    }),
  );
  await assertFails(deleteDoc(counter));
  await environment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), "systemCounters/subjects"));
  });
  await assertFails(setDoc(counter, { lastAllocatedNumber: -1 }));
});

test("every allocation write must be coupled to both a newly created subject and receipt", async () => {
  const db = anonymous();
  const id = "aaaaaaaaaaaaaaaaaaaa";
  const counter = doc(db, "systemCounters/subjects");
  const subjectRef = doc(db, `subjects/${id}`);
  const receipt = doc(
    db,
    `submissionRequests/collector-one/requests/${firstRequest}`,
  );
  await assertFails(
    setDoc(subjectRef, subject("collector-one", firstRequest, 0)),
  );
  await assertFails(
    setDoc(receipt, {
      subjectId: id,
      subjectCode: "AHT-000",
      subjectNumber: 0,
      requestId: firstRequest,
    }),
  );
  const missingReceipt = writeBatch(db);
  missingReceipt.set(subjectRef, subject("collector-one", firstRequest, 0));
  missingReceipt.set(counter, {
    lastAllocatedNumber: 0,
    lastSubjectId: id,
    lastRequestId: firstRequest,
    lastCreatedByUid: "collector-one",
  });
  await assertFails(missingReceipt.commit());
});

test("forged codes, owner, status, timestamps, extra public keys or admin data are rejected", async () => {
  const db = anonymous();
  for (const alteration of [
    { subjectCode: "AHT-999" },
    { createdByUid: "other" },
    { status: "completed" },
    { createdAt: new Date(0) },
    { publicValues: { ...publicValues(), unauthorized: "extra" } },
    { investigations: { bun: "1" } },
  ]) {
    const id = doc(collection(db, "subjects")).id;
    const batch = writeBatch(db);
    batch.set(doc(db, `subjects/${id}`), {
      ...subject("collector-one", firstRequest, 0),
      ...alteration,
    });
    batch.set(
      doc(db, `submissionRequests/collector-one/requests/${firstRequest}`),
      {
        subjectId: id,
        subjectCode: "AHT-000",
        subjectNumber: 0,
        requestId: firstRequest,
      },
    );
    batch.set(doc(db, "systemCounters/subjects"), {
      lastAllocatedNumber: 0,
      lastSubjectId: id,
      lastRequestId: firstRequest,
      lastCreatedByUid: "collector-one",
    });
    await assertFails(batch.commit());
  }
});

test("public subjects/receipts cannot be updated or deleted; consumed allocation cannot be reused", async () => {
  const db = anonymous();
  const result = await allocate(db, "collector-one", firstRequest);
  await assertFails(
    updateDoc(doc(db, `subjects/${result.subjectId}`), { status: "completed" }),
  );
  await assertFails(deleteDoc(doc(db, `subjects/${result.subjectId}`)));
  await assertFails(
    updateDoc(
      doc(db, `submissionRequests/collector-one/requests/${firstRequest}`),
      { subjectNumber: 99 },
    ),
  );
  await assertFails(
    deleteDoc(
      doc(db, `submissionRequests/collector-one/requests/${firstRequest}`),
    ),
  );
  await environment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), `subjects/${result.subjectId}`));
  });
  const next = await allocate(db, "collector-one", secondRequest);
  assert.equal(next.subjectCode, "AHT-001");
  assert.deepEqual(await allocate(db, "collector-one", firstRequest), result);
});

test("only non-anonymous UID plus manually provisioned admins marker grants subject reads", async () => {
  const result = await allocate(anonymous(), "collector-one", firstRequest);
  await seed("admins/admin-user", {});
  await seed("admins/collector-one", {});
  const admin = password("admin-user");
  await assertSucceeds(getDoc(doc(admin, "admins/admin-user")));
  await assertSucceeds(getDoc(doc(admin, `subjects/${result.subjectId}`)));
  await assertSucceeds(getDocs(collection(admin, "subjects")));
  await assertFails(
    getDoc(doc(password("not-admin"), `subjects/${result.subjectId}`)),
  );
  await assertSucceeds(getDoc(doc(password("not-admin"), "admins/not-admin")));
  await assertFails(getDoc(doc(anonymous(), `subjects/${result.subjectId}`)));
  await assertFails(getDoc(doc(anonymous(), "admins/collector-one")));
  await assertFails(getDoc(doc(admin, "admins/collector-one")));
  for (const db of [admin, password("not-admin"), anonymous()]) {
    await assertFails(setDoc(doc(db, "admins/self-appointed"), {}));
    await assertFails(
      updateDoc(doc(db, "admins/admin-user"), { enabled: true }),
    );
    await assertFails(deleteDoc(doc(db, "admins/admin-user")));
  }
});

test("one counter allocation cannot inject multiple subject documents or arbitrary receipt keys", async () => {
  const db = anonymous();
  const firstId = "aaaaaaaaaaaaaaaaaaaa";
  const extraId = "bbbbbbbbbbbbbbbbbbbb";
  const batch = writeBatch(db);
  batch.set(
    doc(db, `subjects/${firstId}`),
    subject("collector-one", firstRequest, 0),
  );
  batch.set(
    doc(db, `subjects/${extraId}`),
    subject("collector-one", firstRequest, 0),
  );
  batch.set(
    doc(db, `submissionRequests/collector-one/requests/${firstRequest}`),
    {
      subjectId: firstId,
      subjectCode: "AHT-000",
      subjectNumber: 0,
      requestId: firstRequest,
    },
  );
  batch.set(doc(db, "systemCounters/subjects"), {
    lastAllocatedNumber: 0,
    lastSubjectId: firstId,
    lastRequestId: firstRequest,
    lastCreatedByUid: "collector-one",
  });
  await assertFails(batch.commit());
  assert.equal(
    (await getDoc(doc(db, "systemCounters/subjects"))).data()!
      .lastAllocatedNumber,
    -1,
  );
  const invalid = writeBatch(db);
  invalid.set(
    doc(db, `subjects/${firstId}`),
    subject("collector-one", firstRequest, 0),
  );
  invalid.set(
    doc(db, `submissionRequests/collector-one/requests/${firstRequest}`),
    {
      subjectId: firstId,
      subjectCode: "AHT-000",
      subjectNumber: 0,
      requestId: firstRequest,
      nationalId: "RULES-DEMO",
    },
  );
  invalid.set(doc(db, "systemCounters/subjects"), {
    lastAllocatedNumber: 0,
    lastSubjectId: firstId,
    lastRequestId: firstRequest,
    lastCreatedByUid: "collector-one",
  });
  await assertFails(invalid.commit());
});
