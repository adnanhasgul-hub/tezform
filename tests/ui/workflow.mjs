import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "http://127.0.0.1:5190";
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5190",
    "--strictPort",
  ],
  { cwd: root, stdio: "pipe" },
);
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* server startup */
    }
    if (attempt === 99) throw Error("UI test server did not start");
    await delay(100);
  }
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/lib/chromium/chromium")
      ? "/usr/lib/chromium/chromium"
      : existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined);
  browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: "/tmp/tezform-ui-config",
      XDG_CACHE_HOME: "/tmp/tezform-ui-cache",
    },
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  // Test component injection is confined to this test harness, never an application URL flag.
  await page.route("**/ui-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="tr"><head><link rel="stylesheet" href="/src/index.css?direct"></head><body><div id="ui-root"></div></body></html>',
    }),
  );
  await page.route("https://**", (route) => route.abort());
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  async function fillRequiredPublicAnswers() {
    const next = () =>
      page.getByRole("button", { name: /Sonraki Bölüm/ }).click();
    const chooseFirstRadio = async (id) => {
      await page.locator(`#crf-${id} input[type=radio]`).first().check();
    };
    const chooseCheckbox = async (id, label) => {
      await page.locator(`#crf-${id}`).getByLabel(label, { exact: true }).check();
    };

    await page.locator("#crf-nationalId").fill("UI-DEMO");
    await chooseFirstRadio("sex");
    await page.locator("#crf-age").fill("45");
    await page.locator("#crf-weight").fill("80");
    await page.locator("#crf-height").fill("180");
    await next();

    await chooseFirstRadio("dailyDose");
    await page.locator("#crf-treatmentDurationYears").fill("3");
    await page.locator("#crf-treatmentDurationMonths").fill("4");
    await chooseFirstRadio("adherence");
    await page.locator("#crf-lastDoseTime").fill("12:30");
    await next();

    await chooseCheckbox("otherAntithrombotic", "Hayır");
    await chooseFirstRadio("nsaid");
    await chooseCheckbox("inhibitors", "Hiçbiri");
    await chooseCheckbox("inducers", "Hiçbiri");
    await next();

    for (const id of [
      "bruising",
      "gingivalBleeding",
      "epistaxis",
      "cutBleeding",
      "melena",
      "hematochezia",
      "hematemesis",
      "hematuria",
      "menorrhagia",
      "headache",
      "neurologicalSymptoms",
      "hemarthrosis",
      "hemoptysis",
      "subconjunctivalBleeding",
    ])
      await chooseFirstRadio(id);
    await next();

    for (const id of [
      "healthcareVisit",
      "transfusion",
      "treatmentInterruption",
      "hemoglobinDrop",
    ])
      await chooseFirstRadio(id);
    await next();

    // The two approved optional fields remain intentionally blank.
    await chooseFirstRadio("bleedingDayDose");
    await page.locator("#crf-investigatorName").selectOption({ label: "Dr. Mehmet" });
  }

  await page.goto(`${origin}/ui-harness`);
  await page.evaluate(async () => {
    const { injectIntoGlobalHook } = await import("/@react-refresh");
    injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    const [{ default: React }, { default: DOM }, { CrfForm }, { PrintCrf }] =
      await Promise.all([
        import("/node_modules/.vite/deps/react.js"),
        import("/node_modules/.vite/deps/react-dom_client.js"),
        import("/src/components/crf/CrfForm.tsx"),
        import("/src/components/crf/PrintCrf.tsx"),
      ]);
    const state = (window.uiState = {
      calls: 0,
      ids: [],
      prints: 0,
      resolve: null,
      reject: null,
    });
    const save = (_draft, requestId) => {
      state.calls++;
      state.ids.push(requestId);
      return new Promise((resolve, reject) => {
        state.resolve = () =>
          resolve({
            subjectId: "a".repeat(20),
            subjectCode: "AHT-000",
            subjectNumber: 0,
            requestId,
          });
        state.reject = () => reject(Error("test failure"));
      });
    };
    window.print = () => {
      state.prints++;
    };
    function Harness() {
      const [record, setRecord] = React.useState(null),
        [ack, setAck] = React.useState(false),
        [closed, setClosed] = React.useState(false);
      return React.createElement(
        React.Fragment,
        null,
        closed
          ? React.createElement("p", null, "Başlangıç ekranı")
          : React.createElement(
              "div",
              { className: "app-shell form-active" },
              React.createElement(CrfForm, {
                save,
                onRegistered: (values, result) => setRecord({ values, result }),
                onAcknowledged: () => setAck(true),
                onPrint: () => window.print(),
                onClose: () => {
                  setRecord(null);
                  setAck(false);
                  setClosed(true);
                },
              }),
            ),
        React.createElement(PrintCrf, {
          preview: false,
          onClose: () => {},
          blocked: !!record && !ack,
          values: record && ack ? record.values : undefined,
          subjectCode: record && ack ? record.result.subjectCode : undefined,
        }),
      );
    }
    DOM.createRoot(document.querySelector("#ui-root")).render(
      React.createElement(Harness),
    );
  });
  await page
    .getByRole("heading", { name: "Olgu rapor formu", exact: true })
    .waitFor();
  assert.equal(await page.locator("#crf-assessmentDate").count(), 0);
  const section7 = page
    .locator(".stepper")
    .getByRole("button", { name: /^Bölüm 7:/ });
  assert(await section7.isDisabled());
  await page.getByRole("button", { name: /Sonraki Bölüm/ }).click();
  await page.getByText("Bu alan zorunludur.", { exact: true }).first().waitFor();
  assert.equal(await page.locator("#crf-nationalId").count(), 1);

  await fillRequiredPublicAnswers();
  assert.equal(await page.locator("#crf-bleedingOnsetInterval").inputValue(), "");
  assert.equal(await page.locator("#crf-researchNotes").inputValue(), "");
  const save = page.getByRole("button", { name: "Formu Kaydet", exact: true });
  await save.click();
  await page
    .getByRole("button", { name: "Kaydediliyor...", exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Kaydediliyor...", exact: true })
      .isDisabled(),
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.evaluate(() => window.uiState.calls), 1);
  await page.evaluate(() => window.uiState.reject());
  await page
    .getByRole("alert")
    .filter({ hasText: "Kayıt oluşturulamadı. Lütfen tekrar deneyin." })
    .waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await save.click();
  await page.waitForFunction(() => window.uiState.calls === 2);
  assert.equal(await page.evaluate(() => new Set(window.uiState.ids).size), 1);
  await page.evaluate(() => window.uiState.resolve());
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Formu Yazdır", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Formu Kapat", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.locator(".print-view").count(), 0);
  await page.keyboard.press("Escape");
  assert(await dialog.isVisible());
  await page.mouse.click(1, 1);
  assert(await dialog.isVisible());
  // Clipboard rejection stays inside the dialog and never dismisses it.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("test denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Kodu Kopyala", exact: true }).click();
  await page
    .getByText("Kopyalanamadı. Kodu elle kaydedebilirsiniz.", { exact: true })
    .waitFor();
  assert(await dialog.isVisible());
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".assigned-code")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
  );
  await page
    .getByRole("button", { name: "Kodu Kaydettim", exact: true })
    .click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Formu Yazdır", exact: true }).click();
  await page.getByRole("button", { name: "Formu Yazdır", exact: true }).click();
  assert.equal(await page.evaluate(() => window.uiState.calls), 2);
  assert.equal(await page.evaluate(() => window.uiState.prints), 2);
  assert((await page.locator(".print-sheet").innerText()).includes("UI-DEMO"));
  assert.equal(await page.locator("[data-print-field]").count(), 70);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "/tmp/tezform-spark-filled.pdf",
    preferCSSPageSize: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Formu Kapat", exact: true }).click();
  await page.getByText("Başlangıç ekranı", { exact: true }).waitFor();
  assert(!(await page.locator(".print-sheet").innerText()).includes("UI-DEMO"));
  console.log(
    "PASS required progression; optional Section 7 text fields; save pending/failure/retry; UUID reuse; required modal Escape/overlay lock; copy failure; acknowledgment; print without new allocation; close clears session",
  );

  // Actual /admin page: generic wrong-username error, no email field or dashboard.
  await page.goto(`${origin}/admin`);
  await page
    .getByRole("heading", { name: "Yönetici Girişi", exact: true })
    .waitFor();
  await page.getByLabel("Kullanıcı Adı", { exact: true }).fill("invalid-alias");
  await page.getByLabel("Şifre", { exact: true }).fill("test-only-fixture");
  await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
  await page
    .getByText("Kullanıcı adı veya şifre hatalı.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("input[type=email]").count(), 0);
  assert.equal(
    await page
      .getByRole("heading", { name: "Yönetici Paneli", exact: true })
      .count(),
    0,
  );
  await page.goto(origin);
  assert.equal(
    await page.getByRole("heading", {
      name: "Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Veri Toplama Formu",
      exact: true,
    }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Boş Form Yazdır", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".paper-checkbox")
      .evaluateAll((elements) =>
        elements.every((element) => element.textContent.trim() === ""),
      ),
    true,
  );
  assert.equal(await page.locator("[data-print-field]").count(), 70);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "/tmp/tezform-spark-blank.pdf",
    preferCSSPageSize: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Forma Dön", exact: true }).click();
  await page.getByRole("radio", { name: "Hayır", exact: true }).check();
  await page.getByRole("button", { name: "Formu Doldur", exact: true }).click();
  await fillRequiredPublicAnswers();
  assert.equal(await page.locator("#crf-assessmentDate").count(), 0);
  await page.getByRole("button", { name: "Formu Kaydet", exact: true }).click();
  await page
    .getByText("Kayıt sistemiyle bağlantı kurulamadı. Lütfen tekrar deneyin.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(runtimeErrors, []);
  console.log(
    "PASS duplicate center title removed; actual admin guard/wrong alias/no email; blank print unmarked; required answers pass before missing Firebase error; no runtime errors",
  );
  // Stress-print all fields with synthetic values, including the future admin section.
  await page.evaluate(async () => {
    const [
      { default: React },
      { default: DOM },
      { PrintCrf },
      { crfSections, createEmptyCrf },
      { recalculateDerived },
    ] = await Promise.all([
      import("/node_modules/.vite/deps/react.js"),
      import("/node_modules/.vite/deps/react-dom_client.js"),
      import("/src/components/crf/PrintCrf.tsx"),
      import("/src/components/crf/sections.ts"),
      import("/src/components/crf/calculations.ts"),
    ]);
    const values = createEmptyCrf();
    for (const field of crfSections.flatMap((section) => section.fields)) {
      values[field.id] =
        field.kind === "multiselect"
          ? [field.options.at(-1)]
          : field.kind === "radio" || field.kind === "select"
            ? (field.options.find((value) => value === "Evet ->") ??
              field.options[0])
            : field.kind === "date"
              ? "2026-10-24"
              : field.kind === "time"
                ? "12:30"
                : field.kind === "number"
                  ? "3"
                  : "UI-DEMO";
    }
    values.weight = "80";
    values.height = "180";
    values.treatmentDurationYears = "3";
    values.treatmentDurationMonths = "4";
    document.querySelector("#root").remove();
    const host = document.createElement("div");
    document.body.append(host);
    DOM.createRoot(host).render(
      React.createElement(PrintCrf, {
        preview: true,
        onClose: () => {},
        values: recalculateDerived(values),
        subjectCode: "AHT-TEST",
      }),
    );
  });
  await page
    .locator(".print-subject-code")
    .filter({ hasText: "AHT-TEST" })
    .waitFor();
  assert.equal(await page.locator("[data-print-field]").count(), 70);
  assert(
    (await page.locator(".print-sheet").innerText()).includes(
      "3 yıl 4 ay (40 ay)",
    ),
  );
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "/tmp/tezform-spark-all-fields.pdf",
    preferCSSPageSize: true,
  });
  console.log(
    "PASS all 70 fields stress print with synthetic data; duration total included; no allocation performed",
  );
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
