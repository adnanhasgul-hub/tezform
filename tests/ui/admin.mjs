import assert from "node:assert/strict";

// Browser-only module interception; no test flags or alternate auth in the app.
export async function checkAdmin(browser, origin) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await page.route("https://**", (route) => route.abort());
    await page.route(/\/src\/services\/auth\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      export class AdminLoginError extends Error {}
      export const observeAdminSession=listener=>{queueMicrotask(()=>listener({status:'authorized',uid:'synthetic-admin'}));return()=>{};};
      export const loginAdmin=async()=>{throw Error('unused synthetic login');};
      export const logoutAdmin=async()=>{};
      export const ensureAnonymousUser=async()=>{throw Error('no public writes in fixture');};
      export const reauthenticateAdmin=async()=>{throw Error('synthetic rejection');};
    `,
      }),
    );
    await page.route(/\/src\/services\/adminRecords\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      import {crfSections,createEmptyCrf} from '/src/components/crf/sections.ts';
      import {toCrfValues} from '/src/components/crf/calculations.ts';
      import {investigationValues,investigationSection,recordStatus} from '/src/services/adminModel.ts';
      const empty=investigationValues(createEmptyCrf());
      const full={...empty};
      for(const field of investigationSection.fields)full[field.id]=field.kind==='multiselect'?[field.options[0]]:'1';
      const records=[
        {id:'aaaaaaaaaaaaaaaaaaaa',subjectCode:'AHT-000',subjectNumber:0,status:'completed',investigations:{},doctor:'Dr. Mehmet'},
        {id:'bbbbbbbbbbbbbbbbbbbb',subjectCode:'AHT-001',subjectNumber:1,status:'completed',investigations:{...empty,bun:'15'},doctor:''},
        {id:'cccccccccccccccccccc',subjectCode:'AHT-002',subjectNumber:2,status:'pending_completion',investigations:full,doctor:'Dr. Adnan'}
      ].map(item=>({...item,createdAt:new Date(),updatedAt:new Date(),publicValues:{...toCrfValues(createEmptyCrf()),investigatorName:item.doctor}}));
      export const listAdminSubjects=async()=>records.map(item=>({...item}));
      export const saveAdminSubject=async(id,draft)=>{const record=records.find(item=>item.id===id);record.investigations=investigationValues(draft);record.status=recordStatus(record.investigations);};
      export const deleteAdminSubject=async()=>{throw Error('synthetic rejection');};
    `,
      }),
    );
    await page.goto(`${origin}/admin`);
    const row = (code) => page.getByRole("row").filter({ hasText: code });
    await row("AHT-002").waitFor();
    assert.equal(
      await row("AHT-000").locator(".admin-status").innerText(),
      "Boş",
    );
    assert.equal(
      await row("AHT-001").locator(".admin-status").innerText(),
      "Devam Et",
    );
    assert.equal(
      await row("AHT-002").locator(".admin-status").innerText(),
      "Tamamlandı",
    );
    await row("AHT-002")
      .getByRole("button", { name: "Bölüm 4 Düzenle", exact: true })
      .waitFor();
    const search = page.getByRole("searchbox");
    await search.fill("Dr. Adnan");
    assert.equal(await page.locator("tbody tr").count(), 1);
    assert((await row("AHT-002").innerText()).includes("Dr. Adnan"));
    await search.fill("");
    await row("AHT-001")
      .getByRole("button", { name: "Devam Et", exact: true })
      .click();
    assert.equal(await page.locator("#crf-bun").inputValue(), "15");
    await page.locator("#crf-creatinine").fill("2");
    await page.getByRole("button", { name: "Kaydet ve Listeye Dön" }).click();
    await row("AHT-001")
      .getByRole("button", { name: "Devam Et", exact: true })
      .click();
    assert.equal(await page.locator("#crf-creatinine").inputValue(), "2");
    await page.getByRole("button", { name: "Kaydet ve Listeye Dön" }).click();
    await row("AHT-002")
      .getByRole("button", { name: "Tüm Formu Düzenle" })
      .click();
    await page.locator("#crf-nationalId").waitFor();
    await page.locator("#crf-bun").waitFor();
    await page.locator("#crf-investigatorName").waitFor();
    assert.equal(await page.locator("#crf-assessmentDate").count(), 0);
    await page.getByRole("button", { name: "← Hasta Listesine Dön" }).click();
    await row("AHT-002")
      .getByRole("button", { name: "Görüntüle", exact: true })
      .click();
    assert.equal(await page.locator(".admin-detail-section").count(), 7);
    await page.getByRole("button", { name: "← Hasta Listesine Dön" }).click();
    await row("AHT-002")
      .getByRole("button", { name: "Yazdır", exact: true })
      .click();
    await page
      .locator(".print-subject-code")
      .filter({ hasText: "AHT-002" })
      .waitFor();
    await page.evaluate(() => {
      window.printCalls = 0;
      window.print = () => window.printCalls++;
    });
    await page.getByRole("button", { name: "Yazdır", exact: true }).click();
    assert.equal(await page.evaluate(() => window.printCalls), 1);
    await page.emulateMedia({ media: "print" });
    assert((await page.locator(".print-sheet").boundingBox()).height > 100);
    assert.equal(
      await page.locator('[data-print-field="bun"] .paper-answer').innerText(),
      "1",
    );
    await page.pdf({
      path: "/tmp/tezform-admin-filled.pdf",
      preferCSSPageSize: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page
      .getByRole("button", { name: "Hasta Listesine Dön", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await row("AHT-000")
      .getByRole("button", { name: "Sil", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert(
      (await page.getByRole("dialog").innerText()).includes(
        "AHT-000 kodu başka bir hastaya verilmeyecektir.",
      ),
    );
    assert(
      await page
        .getByRole("button", { name: "Kalıcı Olarak Sil" })
        .isDisabled(),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    console.log(
      "PASS actual admin dashboard states from values, physician search, partial save/reopen, full editor, seven-section detail, nested print media/PDF, mobile delete confirmation",
    );
  } finally {
    await page.close();
  }
}
