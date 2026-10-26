import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { spssSchema } from "../../src/export/spssSchema.ts";

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
      let sessionListener;
      export class AdminLoginError extends Error {constructor(reason){super('Admin login failed');this.reason=reason;}}
      export const observeAdminSession=listener=>{sessionListener=listener;window.emitAdminSession=status=>listener({status,uid:'synthetic-admin'});queueMicrotask(()=>listener({status:'authorized',uid:'synthetic-admin'}));return()=>{};};
      export const loginAdmin=async(...args)=>{window.adminLoginCalls=(window.adminLoginCalls||0)+1;window.adminLoginArgumentCount=args.length;if(args[0]!=='synthetic-correct')throw new AdminLoginError('credentials');sessionListener({status:'authorized',uid:'synthetic-admin'});};
      export const logoutAdmin=async()=>{sessionListener({status:'signed-out'});};
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
      full.dvtSide=['Sağ'];full.dvtLeftLocations=[];
      const records=[
        {id:'aaaaaaaaaaaaaaaaaaaa',subjectCode:'AHT-000',subjectNumber:0,status:'completed',investigations:{},doctor:'Dr. Mehmet'},
        {id:'bbbbbbbbbbbbbbbbbbbb',subjectCode:'AHT-001',subjectNumber:1,status:'completed',investigations:{...empty,bun:'15'},doctor:''},
        {id:'cccccccccccccccccccc',subjectCode:'AHT-002',subjectNumber:2,status:'pending_completion',investigations:full,doctor:'Dr. Adnan'}
      ].map(item=>({...item,createdAt:new Date(),updatedAt:new Date(),publicValues:{...toCrfValues(createEmptyCrf()),investigatorName:item.doctor}}));
      export const listAdminSubjects=async()=>{window.adminFixtureReads=(window.adminFixtureReads||0)+1;return records.map(item=>({...item}));};
      export const saveAdminSubject=async(id,draft)=>{window.adminFixtureWrites=(window.adminFixtureWrites||0)+1;const record=records.find(item=>item.id===id);record.investigations=investigationValues(draft);record.status=recordStatus(record.investigations);};
      export const deleteAdminSubject=async()=>{throw Error('synthetic rejection');};
    `,
      }),
    );
    await page.goto(`${origin}/admin`);
    const row = (code) => page.getByRole("row").filter({ hasText: code });
    await row("AHT-002").waitFor();
    assert.equal(await page.getByRole("heading", { name: "Araştırma Veri Merkezi", exact: true }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Yönetici Paneli", exact: true }).count(), 0);
    assert.equal(await page.locator(".admin-table").count(), 1);
    assert.equal(await page.locator(".admin-stats").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Araştırma Veri Merkezi", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Yönetici Paneline Dön/ }).count(), 0);
    await row("AHT-000").getByRole("button", { name: "Formu Tamamla", exact: true }).click();
    assert.equal(await page.locator("#crf-bun").inputValue(), "");
    await page.getByRole("button", { name: "Kaydet ve Listeye Dön" }).click();
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
    await row("AHT-000")
      .getByRole("button", { name: "Diğer işlemler: AHT-000", exact: true })
      .click();
    await page.getByRole("menu").waitFor();
    const secondTrigger = row("AHT-001").getByRole("button", {
      name: "Diğer işlemler: AHT-001",
      exact: true,
    });
    await secondTrigger.focus();
    await secondTrigger.press("Enter");
    await page
      .getByRole("menu", { name: "AHT-001 diğer işlemler", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("menu").count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("menu").count(), 0);
    await row("AHT-002")
      .getByRole("button", { name: "Diğer işlemler: AHT-002", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Araştırma kayıtları", exact: true })
      .click();
    assert.equal(await page.getByRole("menu").count(), 0);
    await page.screenshot({
      path: "/tmp/tezform-phase-b-admin.png",
      fullPage: true,
    });
    await page.getByLabel("Hekim", { exact: true }).selectOption("Dr. Adnan");
    assert.equal(await page.locator("tbody tr").count(), 1);
    assert((await row("AHT-002").innerText()).includes("Dr. Adnan"));
    await page.getByLabel("Hekim", { exact: true }).selectOption("");
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
      .getByRole("button", { name: "Diğer işlemler: AHT-002", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Tüm Formu Düzenle", exact: true })
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
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(await page.locator(".research-center .admin-table-wrap").evaluate(element => element.scrollWidth > element.clientWidth));
    await row("AHT-000")
      .getByRole("button", { name: "Diğer işlemler: AHT-000", exact: true })
      .click();
    const menuBox = await page.getByRole("menu").boundingBox();
    assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= 390);
    await page.getByRole("menuitem", { name: "Sil", exact: true }).click();
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
    await page
      .getByRole("heading", { name: "Araştırma Veri Merkezi", exact: true })
      .waitFor();
    await page
      .getByText("Filtrelenmiş 3 / toplam 3 kayıt", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Excel'e Aktar", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "SPSS İçin Dışa Aktar", exact: true })
        .count(),
      1,
    );
    await page.getByLabel("Hekim", { exact: true }).selectOption("Dr. Adnan");
    await page
      .getByText("Filtrelenmiş 1 / toplam 3 kayıt", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".research-table tbody tr").count(), 1);
    await page.getByText("Seçilen kapsam: 1 kayıt", { exact: true }).waitFor();
    await page
      .getByRole("radio", { name: "Tüm kayıtları dışa aktar", exact: true })
      .check();
    await page.getByText("Seçilen kapsam: 3 kayıt", { exact: true }).waitFor();
    await page
      .getByRole("radio", {
        name: "Filtrelenmiş kayıtları dışa aktar",
        exact: true,
      })
      .check();
    await page.getByLabel("Durum", { exact: true }).selectOption("empty");
    await page
      .getByText("Filtrelenmiş 0 / toplam 3 kayıt", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Filtreleri Temizle", exact: true })
      .click();
    await page
      .getByText("Filtrelenmiş 3 / toplam 3 kayıt", { exact: true })
      .waitFor();
    await page
      .getByLabel("Başlangıç tarihi", { exact: true })
      .fill("2099-01-01");
    await page.getByLabel("Bitiş tarihi", { exact: true }).fill("2000-01-01");
    assert.equal(
      await page
        .getByLabel("Başlangıç tarihi", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    assert(
      await page
        .getByRole("radio", { name: "Tüm kayıtları dışa aktar", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Filtreleri Temizle", exact: true })
      .click();
    await page.getByLabel("AHT kodu", { exact: true }).fill("AHT-002");
    await page
      .getByText("Filtrelenmiş 1 / toplam 3 kayıt", { exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/tezform-phase-c-center.png",
      fullPage: true,
    });
    async function download(button, path) {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: button, exact: true }).click();
      const file = await pending;
      await file.saveAs(path);
      return readFileSync(path);
    }
    const beforeExports = await page.evaluate(() => ({ reads: window.adminFixtureReads, writes: window.adminFixtureWrites }));
    for (const [scope, count] of [
      ["Filtrelenmiş kayıtları dışa aktar", 1],
      ["Tüm kayıtları dışa aktar", 3],
    ]) {
      await page.getByRole("radio", { name: scope, exact: true }).check();
      const bytes = await download(
        "SPSS İçin Dışa Aktar",
        `/tmp/tezform-browser-${count}.zip`,
      );
      const files = unzipSync(bytes);
      assert(strFromU8(files["README.txt"]).includes(`Kayıt sayısı: ${count}`));
      const workbook = unzipSync(files["tezform_spss_data.xlsx"]);
      assert.equal(
        [...strFromU8(workbook["xl/worksheets/sheet1.xml"]).matchAll(/<row\b/g)]
          .length,
        count + 1,
      );
    }
    const human = unzipSync(
      await download("Excel'e Aktar", "/tmp/tezform-browser-human.xlsx"),
    );
    assert.equal(
      [...strFromU8(human["xl/worksheets/sheet1.xml"]).matchAll(/<row\b/g)]
        .length,
      4,
    );
    await page
      .getByRole("button", { name: "SPSS Veri Sözlüğü", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "SPSS Veri Sözlüğü", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".dictionary-table tbody tr").count(),
      spssSchema.length,
    );
    assert.deepEqual(
      await page
        .locator(".dictionary-table tbody tr")
        .evaluateAll((rows) => rows.map((row) => row.dataset.variable)),
      spssSchema.map((variable) => variable.name),
    );
    await page
      .getByLabel("Sözlükte ara", { exact: true })
      .fill("DVT_RIGHT_LOCATIONS");
    assert.equal(await page.locator(".dictionary-table tbody tr").count(), 7);
    await page.getByLabel("Bölüm", { exact: true }).selectOption("4");
    assert.equal(await page.locator(".dictionary-table tbody tr").count(), 7);
    const pdf = await PDFDocument.load(
      await download("PDF Olarak İndir", "/tmp/tezform-browser-dictionary.pdf"),
    );
    assert(pdf.getPageCount() > 1);
    assert.equal(
      pdf.getKeywords(),
      spssSchema.map((variable) => variable.name).join(" "),
    );
    await page
      .getByRole("button", { name: "Veri Merkezine Dön", exact: true })
      .click();
    await page
      .getByText("Filtrelenmiş 1 / toplam 3 kayıt", { exact: true })
      .waitFor();
    await page.getByText("Seçilen kapsam: 3 kayıt", { exact: true }).waitFor();
    await row("AHT-002").getByRole("button", { name: "Görüntüle", exact: true }).click();
    await page.getByRole("button", { name: "← Hasta Listesine Dön" }).click();
    assert.equal(await page.getByLabel("AHT kodu", { exact: true }).inputValue(), "AHT-002");
    await page.getByText("Seçilen kapsam: 3 kayıt", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({ reads: window.adminFixtureReads, writes: window.adminFixtureWrites })), beforeExports);
    const beforeRefresh = await page.evaluate(() => window.adminFixtureReads);
    await page.getByRole("button", { name: "Listeyi Yenile", exact: true }).click();
    await page.waitForFunction(count => window.adminFixtureReads === count + 1, beforeRefresh);
    await page.getByText("Filtrelenmiş 1 / toplam 3 kayıt", { exact: true }).waitFor();
    console.log(
      "PASS research filters/scopes, real filtered/all XLSX+ZIP downloads, schema dictionary and Turkish PDF download; filters retained",
    );
    console.log(
      "PASS unified center states, all row actions, partial save/reopen, full editor, seven-section detail, print, mobile scroll/delete menu, refresh; filters and export scope retained",
    );
    await page.getByRole("button", { name: "Çıkış Yap", exact: true }).click();
    await page.getByRole("heading", { name: "Yönetici Girişi", exact: true }).waitFor();
    assert.equal(await page.locator("input").count(), 1);
    assert.equal(await page.locator("input[type=password]").count(), 1);
    assert.equal(await page.getByLabel("Kullanıcı Adı", { exact: true }).count(), 0);
    assert(!(await page.locator("body").innerText()).includes("adnan"));
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    assert.equal(await page.evaluate(() => window.adminLoginCalls || 0), 0);
    const password = page.getByLabel("Şifre", { exact: true });
    assert(await password.evaluate(element => element.validity.valueMissing));
    await password.fill("synthetic-wrong");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await page.getByText("Şifre hatalı.", { exact: true }).waitFor();
    assert.equal(await password.inputValue(), "");
    assert.equal(await page.locator(".research-center").count(), 0);
    await password.fill("synthetic-correct");
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).click();
    await row("AHT-002").waitFor();
    assert.equal(await page.evaluate(() => window.adminLoginArgumentCount), 1);
    await page.getByRole("heading", { name: "Araştırma Veri Merkezi", exact: true }).waitFor();
    const beforeDenied = await page.evaluate(() => window.adminFixtureReads);
    await page.evaluate(() => window.emitAdminSession("unauthorized"));
    await page.getByText("Bu hesap yönetici yetkisine sahip değil.", { exact: true }).waitFor();
    assert.equal(await page.locator(".research-center").count(), 0);
    assert.equal(await page.evaluate(() => window.adminFixtureReads), beforeDenied);
    await page.getByRole("link", { name: "← Forma Dön", exact: true }).click();
    await page.getByRole("link", { name: "AVM — Araştırma Veri Merkezi", exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
    console.log("PASS password-only UI; empty/wrong passwords rejected; password cleared; direct authorized center; unauthorized data blocked; logout and return to public form");
  } finally {
    await page.close();
  }
}
