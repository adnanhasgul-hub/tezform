import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

const printButton = (page) =>
  page.getByRole("button", { name: "Formu Yazdır", exact: true });
const acknowledgeButton = (page) =>
  page.getByRole("button", { name: "Kodu Kaydettim", exact: true });
const unloadProtected = (page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

export async function checkRegistrationPrint(page, origin, fillRequiredAnswers) {
  // Intercept persistence only in this browser test; exercise the real HomePage.
  const registrationModule = "**/src/services/registration.ts";
  const mockRegistration = (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        export class RegistrationConnectionError extends Error {}
        export function registerSubject(_values, requestId) {
          window.registrationPrint.calls++;
          return new Promise((resolve) => {
            window.registrationPrint.resolve = () => resolve({
              subjectId: "p".repeat(20), subjectCode: "AHT-042",
              subjectNumber: 42, requestId,
            });
          });
        }
      `,
    });
  await page.route(registrationModule, mockRegistration);
  try {
    await page.goto(`${origin}/ui-harness`);
    await page.evaluate(async () => {
      const { injectIntoGlobalHook } = await import("/@react-refresh");
      injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      const [{ default: React }, { default: DOM }, { HomePage }] =
        await Promise.all([
          import("/node_modules/.vite/deps/react.js"),
          import("/node_modules/.vite/deps/react-dom_client.js"),
          import("/src/pages/HomePage.tsx"),
        ]);
      const state = (window.registrationPrint = {
        calls: 0,
        printed: [],
        resolve: null,
      });
      window.print = () => {
        state.printed.push(document.querySelector(".print-sheet").textContent);
      };
      window.registrationRoot = DOM.createRoot(
        document.querySelector("#ui-root"),
      );
      window.registrationRoot.render(React.createElement(HomePage));
    });
    await page.getByRole("radio", { name: "Hayır", exact: true }).check();
    await page.getByRole("button", { name: "Formu Doldur", exact: true }).click();
    await fillRequiredAnswers();
    await page.locator("#crf-researchNotes").fill("YAZDIRMA-TEST-NOTU");
    await page.getByRole("button", { name: "Formu Kaydet", exact: true }).click();
    await page.getByRole("button", { name: "Kaydediliyor...", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await printButton(page).count(), 0);
    await page.evaluate(() => window.registrationPrint.resolve());
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.locator(".assigned-code").innerText(), "AHT-042");
    assert.deepEqual(
      await dialog.locator("button").allTextContents(),
      ["Kodu Kopyala", "Formu Yazdır", "Kodu Kaydettim"],
    );
    assert.equal(await unloadProtected(page), true);
    await printButton(page).click();
    assert(await dialog.isVisible());
    assert.equal(await unloadProtected(page), true);
    assert.equal(await page.getByRole("button", { name: "Formu Kapat", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.registrationPrint.calls), 1);
    const printed = await page.evaluate(() => window.registrationPrint.printed);
    assert.equal(printed.length, 1);
    for (const answer of ["AHT-042", "UI-DEMO", "YAZDIRMA-TEST-NOTU", "Dr. Mehmet"])
      assert(printed[0].includes(answer));
    assert.equal(await page.locator("[data-print-field]").count(), 71);
    await page.keyboard.press("Escape");
    assert(await dialog.isVisible());
    await page.emulateMedia({ media: "print" });
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator(".app-shell").isVisible(), false);
    assert(await page.locator(".print-view").isVisible());
    const pdf = await page.pdf({
      path: "/tmp/tezform-code-dialog-filled.pdf",
      preferCSSPageSize: true,
    });
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2);
    await page.emulateMedia({ media: "screen" });
    assert(await dialog.isVisible());
    assert.equal(await unloadProtected(page), true);
    await acknowledgeButton(page).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await unloadProtected(page), false);
    await printButton(page).click();
    const afterAcknowledgment = await page.evaluate(() => window.registrationPrint.printed);
    assert.equal(afterAcknowledgment.length, 2);
    assert.equal(afterAcknowledgment[0], afterAcknowledgment[1]);
    assert.equal(await page.evaluate(() => window.registrationPrint.calls), 1);
    await page.getByRole("button", { name: "Formu Kapat", exact: true }).click();
    await page.getByText("Hasta eş zamanlı antiagregan kullanıyor mu?", { exact: true }).waitFor();
    const clearedPrint = await page.locator(".print-sheet").textContent();
    assert(!clearedPrint.includes("AHT-042"));
    assert(!clearedPrint.includes("YAZDIRMA-TEST-NOTU"));

    // A failed/unready print snapshot must expose no nonfunctional print action.
    await page.evaluate(async () => {
      const [{ default: React }, { RegistrationComplete }] = await Promise.all([
        import("/node_modules/.vite/deps/react.js"),
        import("/src/components/crf/RegistrationComplete.tsx"),
      ]);
      const state = (window.dialogPrint = { acknowledged: 0, printed: 0, closed: 0 });
      window.renderCodeDialog = (printReady) =>
        window.registrationRoot.render(React.createElement(RegistrationComplete, {
          code: "AHT-042", printReady,
          onAcknowledged: () => state.acknowledged++,
          onPrint: () => state.printed++,
          onClose: () => state.closed++,
        }));
      window.renderCodeDialog(false);
    });
    await dialog.waitFor();
    assert.equal(await printButton(page).count(), 0);
    await page.evaluate(() => window.renderCodeDialog(true));
    await printButton(page).waitFor();
    await printButton(page).click();
    assert.deepEqual(await page.evaluate(() => window.dialogPrint), {
      acknowledged: 0, printed: 1, closed: 0,
    });
    assert(await dialog.isVisible());
    await acknowledgeButton(page).focus();
    await page.keyboard.press("Tab");
    assert(await page.getByRole("button", { name: "Kodu Kopyala", exact: true }).evaluate((element) => element === document.activeElement));
    await page.keyboard.press("Shift+Tab");
    assert(await acknowledgeButton(page).evaluate((element) => element === document.activeElement));
    await page.evaluate(() => window.renderCodeDialog(false));
    await printButton(page).waitFor({ state: "detached" });
    await acknowledgeButton(page).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await printButton(page).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.dialogPrint), {
      acknowledged: 1, printed: 1, closed: 0,
    });
    await page.evaluate(() => window.renderCodeDialog(true));
    await printButton(page).click();
    assert.deepEqual(await page.evaluate(() => window.dialogPrint), {
      acknowledged: 1, printed: 2, closed: 0,
    });
    console.log("PASS code-dialog print uses real HomePage saved snapshot/AHT code; no acknowledgment or extra save; unload guard retained until explicit acknowledgment; unchanged two-page print excludes modal/UI; printReady and callback isolation; existing completion print preserved");
  } finally {
    await page.unroute(registrationModule, mockRegistration);
  }
}
