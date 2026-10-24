import { mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "tezform-rules-"));
try {
  await copyFile(
    join(root, "firestore.rules"),
    join(directory, "firestore.rules"),
  );
  await writeFile(
    join(directory, "firebase.json"),
    JSON.stringify({
      firestore: { rules: "firestore.rules" },
      emulators: {
        firestore: { port: 8080 },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    }),
  );
  const child = spawn(
    join(root, "node_modules/.bin/firebase"),
    [
      "emulators:exec",
      "--only",
      "firestore",
      "--project",
      "demo-tezform-rules",
      "--config",
      join(directory, "firebase.json"),
      "node --test tests/rules/*.test.ts",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        CI: "true",
        XDG_CONFIG_HOME: join(directory, "config"),
        XDG_CACHE_HOME: join(tmpdir(), "tezform-rules-cache"),
        FIREBASE_EMULATORS_PATH: join(tmpdir(), "tezform-firestore-emulators"),
      },
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
