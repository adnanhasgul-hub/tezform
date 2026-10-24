import assert from "node:assert/strict";

export async function checkDvt(browser, origin) {
  const page = await browser.newPage();
  try {
    await page.route("https://**", route => route.abort());
    await page.route("**/dvt-harness", route => route.fulfill({
      contentType: "text/html",
      body: '<html lang="tr"><head><link rel="stylesheet" href="/src/index.css?direct"><link rel="stylesheet" href="/src/admin.css?direct"></head><body><div id="dvt-root"></div></body></html>',
    }));
    await page.goto(`${origin}/dvt-harness`);
    await page.evaluate(async () => {
      const { injectIntoGlobalHook } = await import("/@react-refresh");
      injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      const [{ default: React }, { default: DOM }, { AdminInvestigationForm }, { AdminSubjectDetail }, { PrintCrf }, { createEmptyCrf }, { toCrfValues }, { investigationValues, createAdminRecordDraft }] = await Promise.all([
        import("/node_modules/.vite/deps/react.js"), import("/node_modules/.vite/deps/react-dom_client.js"),
        import("/src/components/AdminInvestigationForm.tsx"), import("/src/components/AdminSubjectDetail.tsx"),
        import("/src/components/crf/PrintCrf.tsx"), import("/src/components/crf/sections.ts"),
        import("/src/components/crf/calculations.ts"), import("/src/services/adminModel.ts"),
      ]);
      const root = DOM.createRoot(document.querySelector("#dvt-root"));
      let generation = 0;
      window.dvtState = { calls: 0, saved: null };
      window.renderDvt = (investigations, mode = "edit") => {
        const subject = { id: "a".repeat(20), subjectCode: "AHT-DEMO", subjectNumber: 0,
          status: "pending_completion", createdAt: null, updatedAt: null,
          publicValues: toCrfValues(createEmptyCrf()), investigations };
        root.render(React.createElement(mode === "view" ? AdminSubjectDetail : mode === "print" ? PrintCrf : AdminInvestigationForm, {
          key: ++generation, subject, onBack: () => {}, onCompleted: () => {},
          preview: true, onClose: () => {}, values: createAdminRecordDraft(subject), subjectCode: subject.subjectCode,
          saveRecord: async (_id, draft) => { window.dvtState.calls++; window.dvtState.saved = investigationValues(draft); },
        }));
      };
      window.renderDvt({});
    });
    const right = page.locator("#crf-dvtRightLocations");
    const left = page.locator("#crf-dvtLeftLocations");
    await page.locator("#crf-dvtSide").waitFor();
    assert.equal(await right.count(), 0);
    await page.locator("#crf-dvtSide").getByLabel("Sağ", { exact: true }).check();
    await page.getByText("2. Sağ DVT Lokalizasyonu", { exact: true }).waitFor();
    await right.getByLabel("Femoral", { exact: true }).check();
    await page.locator("#crf-dvtSide").getByLabel("Sol", { exact: true }).check();
    await page.getByText("2A. Sağ DVT Lokalizasyonu", { exact: true }).waitFor();
    await page.getByText("2B. Sol DVT Lokalizasyonu", { exact: true }).waitFor();
    await left.getByLabel("İliak", { exact: true }).check();
    assert(await right.getByLabel("Femoral", { exact: true }).isChecked());
    assert(!(await left.getByLabel("Femoral", { exact: true }).isChecked()));
    await page.locator("#crf-dvtSide").getByLabel("Sağ", { exact: true }).uncheck();
    assert.equal(await right.count(), 0);
    await page.getByRole("button", { name: "Formu Kaydet", exact: true }).click();
    await page.waitForFunction(() => window.dvtState.calls === 1);
    assert.deepEqual(await page.evaluate(() => window.dvtState.saved.dvtRightLocations), []);
    assert.deepEqual(await page.evaluate(() => window.dvtState.saved.dvtLeftLocations), ["İliak"]);
    await page.evaluate(() => window.renderDvt({ dvtSide: ["Sağ"], dvtLocations: ["Popliteal"] }));
    await right.getByLabel("Popliteal", { exact: true }).waitFor();
    assert(await right.getByLabel("Popliteal", { exact: true }).isChecked());
    await page.evaluate(() => window.renderDvt({ dvtSide: ["Sağ", "Sol"], dvtLocations: ["Popliteal"] }));
    await page.getByText("Eski ortak lokalizasyonlar: Popliteal", { exact: true }).waitFor();
    assert(!(await right.getByLabel("Popliteal", { exact: true }).isChecked()));
    assert(!(await left.getByLabel("Popliteal", { exact: true }).isChecked()));
    await page.getByRole("button", { name: "Formu Kaydet", exact: true }).click();
    assert.equal(await page.evaluate(() => window.dvtState.calls), 1);
    await right.getByLabel("Femoral", { exact: true }).check();
    await left.getByLabel("İliak", { exact: true }).check();
    await page.getByLabel("Sağ ve Sol lokalizasyonlarını ayrı ayrı doğruladım.", { exact: true }).check();
    await page.getByRole("button", { name: "Formu Kaydet", exact: true }).click();
    await page.waitForFunction(() => window.dvtState.calls === 2);
    assert(!(await page.evaluate(() => "dvtLocations" in window.dvtState.saved)));
    for (const mode of ["view", "print"]) {
      await page.evaluate(mode => window.renderDvt(window.dvtState.saved, mode), mode);
      await page.getByText("2A. Sağ DVT Lokalizasyonu", { exact: true }).waitFor();
      await page.getByText("2B. Sol DVT Lokalizasyonu", { exact: true }).waitFor();
    }
    const checked = async id => page.locator(`[data-print-field="${id}"] .print-options > span`).evaluateAll(nodes => nodes.filter(node => node.querySelector(".paper-checkbox")?.textContent.trim() === "✓").map(node => node.textContent.replace("✓", "").trim()));
    assert.deepEqual(await checked("dvtRightLocations"), ["Femoral"]);
    assert.deepEqual(await checked("dvtLeftLocations"), ["İliak"]);
    console.log("PASS DVT side-first controls, independent locations, stale cleanup, legacy confirmation, view and print");
  } finally { await page.close(); }
}
