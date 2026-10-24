import {
  createEmptyCrf,
  publicSections,
} from "../../src/components/crf/sections.ts";
import { toCrfValues } from "../../src/components/crf/calculations.ts";
function publicValues() {
  const values = toCrfValues(createEmptyCrf());
  return {
    ...Object.fromEntries(
      publicSections.flatMap((section) =>
        section.fields.map((field) => [field.id, values[field.id]]),
      ),
    ),
    treatmentDurationTotalMonths: null,
  };
}
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
    publicValues: publicValues(),
    investigations: {},
  };
}

function investigations() {
  return {
    dvtRightLocations: ["Femoral", "Popliteal"],
    dvtLeftLocations: [] as string[],
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

async function completeWith(
  db: ReturnType<typeof password>,
  values = investigations(),
) {
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
  assert.deepEqual(saved.investigations.dvtRightLocations, ["Femoral", "Popliteal"]);
  assert.equal(saved.investigations.creatinine, "0.9");
  assert.deepEqual(saved.publicValues, publicValues());
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
    completeWith(admin, { ...complete, bun: 42 } as unknown as typeof complete),
  );
  await assertFails(
    completeWith(admin, { ...complete, bun: [] } as unknown as typeof complete),
  );
  await assertFails(
    completeWith(admin, {
      ...complete,
      bun: null,
    } as unknown as typeof complete),
  );
  await assertFails(
    completeWith(admin, { ...complete, dvtSide: ["Sağ", "Bilinmeyen"] }),
  );
  await assertFails(
    completeWith(admin, { ...complete, dvtRightLocations: ["Femoral", "Femoral"] }),
  );
  await assertFails(
    completeWith(admin, {
      ...complete,
      unauthorized: "extra",
    } as typeof complete),
  );
});

test("admin completion cannot inject malformed public data or alter allocation fields", async () => {
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

test("authorized admin can edit only Section 4 after completion", async () => {
  const admin = password("admin-user");
  await assertSucceeds(completeWith(admin));

  await assertSucceeds(
    updateDoc(doc(admin, subjectPath), {
      investigations: { ...investigations(), bun: "99" },
      updatedAt: serverTimestamp(),
    }),
  );

  const saved = (await assertSucceeds(getDoc(doc(admin, subjectPath)))).data()!;
  assert.equal(saved.status, "completed");
  assert.equal(saved.investigations.bun, "99");
  assert.deepEqual(saved.publicValues, publicValues());
});

test("completed Section 4 edit rejects malformed public data, identity edits and false status", async () => {
  const admin = password("admin-user");
  await assertSucceeds(completeWith(admin));

  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      investigations: { ...investigations(), bun: "98" },
      publicValues: { protected: "changed" },
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      investigations: { ...investigations(), bun: "98" },
      subjectCode: "AHT-999",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(admin, subjectPath), {
      investigations: { ...investigations(), bun: "98" },
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("anonymous and non-admin users cannot edit completed Section 4", async () => {
  const admin = password("admin-user");
  await assertSucceeds(completeWith(admin));

  await assertFails(
    updateDoc(doc(anonymous(), subjectPath), {
      investigations: { ...investigations(), bun: "97" },
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(password("not-admin"), subjectPath), {
      investigations: { ...investigations(), bun: "97" },
      updatedAt: serverTimestamp(),
    }),
  );
});


test("side-specific DVT completeness accepts unilateral and independent bilateral locations; selected missing sides remain partial", async () => {
  const admin = password("admin-user");
  const ref = doc(admin, subjectPath);
  for (const dvt of [
    { dvtSide: ["Sağ"], dvtRightLocations: ["Femoral", "Popliteal"], dvtLeftLocations: [] },
    { dvtSide: ["Sol"], dvtRightLocations: [], dvtLeftLocations: ["İliak"] },
    { dvtSide: ["Sağ", "Sol"], dvtRightLocations: ["Femoral", "Popliteal"], dvtLeftLocations: ["İliak"] },
  ]) {
    await assertSucceeds(completeWith(admin, { ...investigations(), ...dvt }));
    assert.deepEqual((await getDoc(ref)).data()!.investigations.dvtLeftLocations, dvt.dvtLeftLocations);
  }
  for (const dvt of [
    { dvtSide: [], dvtRightLocations: [], dvtLeftLocations: [] },
    { dvtSide: ["Sağ"], dvtRightLocations: [], dvtLeftLocations: [] },
    { dvtSide: ["Sağ", "Sol"], dvtRightLocations: ["Femoral"], dvtLeftLocations: [] },
    { dvtSide: ["Sağ", "Sol"], dvtRightLocations: [], dvtLeftLocations: ["İliak"] },
  ]) {
    const values = { ...investigations(), ...dvt };
    await assertFails(completeWith(admin, values));
    await assertSucceeds(updateDoc(ref, {
      investigations: values,
      status: "pending_completion",
      updatedAt: serverTimestamp(),
    }));
  }
});

test("inactive-side stale locations, invalid options, duplicate values and obsolete shared keys are denied", async () => {
  const admin = password("admin-user");
  for (const dvt of [
    { dvtSide: [], dvtRightLocations: ["Femoral"], dvtLeftLocations: [] },
    { dvtSide: ["Sağ"], dvtRightLocations: ["Femoral"], dvtLeftLocations: ["İliak"] },
    { dvtSide: ["Sol"], dvtRightLocations: ["Femoral"], dvtLeftLocations: ["İliak"] },
    { dvtSide: ["Sağ"], dvtRightLocations: ["Unknown"], dvtLeftLocations: [] },
    { dvtSide: ["Sağ", "Sağ"], dvtRightLocations: ["Femoral"], dvtLeftLocations: [] },
    { dvtSide: ["Sağ", "Sol"], dvtRightLocations: ["Femoral"], dvtLeftLocations: ["İliak", "İliak"] },
  ]) {
    const values = { ...investigations(), ...dvt };
    for (const status of ["pending_completion", "completed"]) {
      await assertFails(updateDoc(doc(admin, subjectPath), {
        investigations: values,
        status,
        updatedAt: serverTimestamp(),
      }));
    }
  }
  await assertFails(completeWith(admin, {
    ...investigations(),
    dvtLocations: ["Femoral"],
  } as ReturnType<typeof investigations>));
});

test("legacy unilateral and ambiguous bilateral records remain admin-readable and may be explicitly rewritten to the canonical model", async () => {
  const admin = password("admin-user");
  const ref = doc(admin, subjectPath);
  for (const sides of [["Sağ"], ["Sol"], ["Sağ", "Sol"]]) {
    const { dvtRightLocations: _right, dvtLeftLocations: _left, ...labAndSide } = investigations();
    const legacy = { ...labAndSide, dvtSide: sides, dvtLocations: ["Popliteal"] };
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), subjectPath), {
        ...pendingSubject(),
        status: "completed",
        investigations: legacy,
      });
    });
    assert.deepEqual((await assertSucceeds(getDoc(ref))).data()!.investigations, legacy);
    await assertFails(getDoc(doc(anonymous(), subjectPath)));
    const rewritten = {
      ...investigations(),
      dvtSide: sides,
      dvtRightLocations: sides.includes("Sağ") ? ["Femoral"] : [],
      dvtLeftLocations: sides.includes("Sol") ? ["İliak"] : [],
    };
    await assertFails(completeWith(anonymous(), rewritten));
    await assertFails(completeWith(password("not-admin"), rewritten));
    await assertSucceeds(completeWith(admin, rewritten));
    const saved = (await getDoc(ref)).data()!.investigations;
    assert.deepEqual(saved, rewritten);
    assert.equal(Object.keys(saved).length, 22);
    assert(!("dvtLocations" in saved));
  }
});
