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
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

const projectId = "demo-tezform-rules";
const requestId = "00000000-0000-4000-8000-000000000001";
const subjectPath = "subjects/aaaaaaaaaaaaaaaaaaaa";
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
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "admins/admin-user"), {
      role: "admin",
    });
    await setDoc(doc(context.firestore(), subjectPath), pendingSubject());
  });
});

function password(uid: string) {
  return environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
}

function anonymous(uid = "collector-one") {
  return environment
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();
}

function pendingSubject() {
  return {
    subjectCode: "AHT-000",
    subjectNumber: 0,
    status: "pending_completion",
    createdAt: Timestamp.fromMillis(1_000),
    updatedAt: Timestamp.fromMillis(1_000),
    createdByUid: "collector-one",
    requestId,
    publicValues: { protected: "unchanged" },
    investigations: {},
  };
}

function investigations() {
  return {
    dvtLocations: ["Femoral", "Popliteal"],
    dvtSide: ["Sağ"],
    bun: "12",
    creatinine: "0.9",
    egfr: "96",
    calcium: "9.4",
    sodium: "139",
    potassium: "4.2",
    totalBilirubin: "0.7",
    directBilirubin: "0.2",
    ast: "24",
    alt: "21",
    totalProtein: "7.1",
    albumin: "4.3",
    wbc: "7.8",
    hemoglobin: "13.6",
    platelets: "248",
    hct: "41",
    pt: "12.1",
    inr: "1.0",
    aptt: "29",
  };
}

async function completeWith(db: ReturnType<typeof password>, values = investigations()) {
  return updateDoc(doc(db, subjectPath), {
    investigations: values,
    status: "completed",
    updatedAt: serverTimestamp(),
  });
}

test("authorized admin can complete a pending subject with the exact Section 4 schema", async () => {
  const admin = password("admin-user");
  await assertSucceeds(completeWith(admin));
  const saved = (await assertSucceeds(getDoc(doc(admin, subjectPath)))).data()!;
  assert.equal(saved.status, "completed");
  assert.deepEqual(saved.investigations.dvtLocations, ["Femoral", "Popliteal"]);
  assert.equal(saved.investigations.creatinine, "0.9");
  assert.deepEqual(saved.publicValues, { protected: "unchanged" });
});

test("anonymous and non-admin users cannot complete Section 4", async () => {
  await assertFails(completeWith(anonymous()));
  await assertFails(completeWith(password("not-admin")));
});

test("admin completion rejects incomplete, extra or invalid Section 4 data", async () => {
  const admin = password("admin-user");
  const complete = investigations();
  const { bun: _bun, ...missingBun } = complete;
  await assertFails(completeWith(admin, missingBun as typeof complete));
  await assertFails(
    completeWith(admin, { ...complete, dvtSide: ["Sağ", "Bilinmeyen"] }),
  );
  await assertFails(
    completeWith(admin, { ...complete, dvtLocations: ["Femoral", "Femoral"] }),
  );
  await assertFails(
    completeWith(admin, { ...complete, unauthorized: "extra" } as typeof complete),
  );
});

test("admin completion cannot alter patient-entered or allocation fields", async () => {
  const admin = password("admin-user");
  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      investigations: investigations(),
      status: "completed",
      updatedAt: serverTimestamp(),
      publicValues: { protected: "changed" },
    }),
  );
  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      investigations: investigations(),
      status: "completed",
      updatedAt: serverTimestamp(),
      subjectCode: "AHT-999",
    }),
  );
});

test("completed Section 4 is immutable in this phase", async () => {
  const admin = password("admin-user");
  await assertSucceeds(completeWith(admin));
  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      "investigations.bun": "99",
      updatedAt: serverTimestamp(),
    }),
  );
});
