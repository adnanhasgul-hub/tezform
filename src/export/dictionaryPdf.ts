import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  dictionaryDisplayHeaders,
  dictionaryDisplayRow,
  SCHEMA_VERSION,
  spssSchema,
} from "./spssSchema.ts";

/** Unicode word/character wrapping with no omitted words or clipped variable names. */
function wrap(
  value: string,
  width: number,
  font: PDFFont,
  size: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.replace(/\s+/g, " ").split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    for (const char of word) {
      if (current && font.widthOfTextAtSize(current + char, size) > width) {
        lines.push(current);
        current = "";
      }
      current += char;
    }
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

export async function buildDictionaryPdf(
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  document.setTitle("TEZFORM – SPSS Veri Sözlüğü");
  document.setSubject(`Şema Versiyonu: ${SCHEMA_VERSION}`);
  document.setKeywords(spssSchema.map((variable) => variable.name));
  document.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  document.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  const widths = [118, 94, 176, 28, 42, 52, 204, 48];
  const left = 32,
    bottom = 36,
    lineHeight = 10,
    size = 7.5;
  let page!: PDFPage;
  let y = 0;
  function newPage() {
    page = document.addPage([841.89, 595.28]);
    page.drawText("TEZFORM – SPSS Veri Sözlüğü", {
      x: left,
      y: 563,
      size: 15,
      font,
    });
    page.drawText(
      `Şema Versiyonu: ${SCHEMA_VERSION} · ${spssSchema.length} değişken`,
      { x: left, y: 545, size: 9, font },
    );
    page.drawText(
      "Missing ve dönüşüm politikaları her değişkenin altında açıklanır. Klinik analiz yapılmaz.",
      { x: left, y: 532, size: 7.5, font },
    );
    page.drawRectangle({
      x: left,
      y: 504,
      width: 762,
      height: 20,
      color: rgb(0.12, 0.12, 0.12),
    });
    let x = left;
    dictionaryDisplayHeaders.forEach((header, index) => {
      page.drawText(header, {
        x: x + 3,
        y: 512,
        size: 7.3,
        font,
        color: rgb(1, 1, 1),
      });
      x += widths[index]!;
    });
    y = 498;
  }
  newPage();
  for (const variable of spssSchema) {
    const cells = dictionaryDisplayRow(variable).map((value, index) =>
      wrap(value, widths[index]! - 6, font, size),
    );
    const detail = wrap(
      `Missing: ${variable.missingPolicy} Açıklama: ${variable.description}`,
      754,
      font,
      7,
    );
    const mainHeight =
      Math.max(...cells.map((lines) => lines.length)) * lineHeight;
    const height = mainHeight + detail.length * 9 + 12;
    if (y - height < bottom) newPage();
    let x = left;
    cells.forEach((lines, index) => {
      lines.forEach((line, n) =>
        page.drawText(line, {
          x: x + 3,
          y: y - n * lineHeight - 8,
          size,
          font,
        }),
      );
      x += widths[index]!;
    });
    detail.forEach((line, n) =>
      page.drawText(line, {
        x: left + 3,
        y: y - mainHeight - n * 9 - 9,
        size: 7,
        font,
        color: rgb(0.25, 0.25, 0.25),
      }),
    );
    y -= height;
    page.drawLine({
      start: { x: left, y },
      end: { x: left + 762, y },
      color: rgb(0.7, 0.7, 0.7),
      thickness: 0.35,
    });
  }
  const pages = document.getPages();
  pages.forEach((item, index) =>
    item.drawText(
      `TEZFORM · Şema ${SCHEMA_VERSION} · Sayfa ${index + 1} / ${pages.length}`,
      { x: left, y: 20, size: 8, font },
    ),
  );
  return document.save();
}
