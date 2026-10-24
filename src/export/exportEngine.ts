import writeXlsxFile, { type Cell, type Row } from "write-excel-file/universal";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  crfSections,
  getFieldAccessibleLabel,
  isFieldVisible,
} from "../components/crf/sections.ts";
import {
  investigationLabels,
  investigationState,
} from "../services/adminModel.ts";
import type { AdminSubjectSummary } from "../services/adminRecords.ts";
import {
  contextFor,
  CRF_SOURCE_FIELD_COUNT,
  dictionaryHeaders,
  dictionaryRows,
  numericValue,
  orderedRecords,
  SCHEMA_VERSION,
  spssDataset,
  spssSchema,
  type ExportCell,
} from "./spssSchema.ts";

export type RecordScope = "filtered" | "all";
const encoder = new TextEncoder();
const fields = crfSections.flatMap((section) =>
  section.fields.map((field) => ({ field, section: section.number })),
);

function text(value: string, header = false): Cell {
  if (value.length > 32767)
    throw new Error(
      "Excel hücre metni desteklenen sınırı aşıyor; veri kesilmedi.",
    );
  return {
    type: String,
    format: "@",
    value,
    ...(header ? { fontWeight: "bold" as const, wrap: true } : {}),
  };
}
function cell(value: ExportCell): Cell {
  return value === null
    ? null
    : typeof value === "number"
      ? { type: Number, value }
      : text(value);
}
async function workbook(
  headers: readonly string[],
  rows: readonly ExportCell[][],
  sheet: string,
  includeSchema = false,
): Promise<Uint8Array> {
  const data: Row[] = [
    headers.map((header) => text(header, true)),
    ...rows.map((row) => row.map(cell)),
  ];
  const columns = headers.map((_, index) => ({ width: index === 1 ? 55 : 24 }));
  const output = includeSchema
    ? writeXlsxFile([
        { sheet, columns, data },
        {
          sheet: "Schema",
          columns: [{ width: 32 }, { width: 24 }],
          data: [
            [text("Schema Version"), text(SCHEMA_VERSION)],
            [text("CRF Source Field Count"), cell(CRF_SOURCE_FIELD_COUNT)],
            [text("SPSS Variable Count"), cell(spssSchema.length)],
            [
              text("Binary Derived Variable Count"),
              cell(
                spssSchema.filter(
                  (variable) => variable.transformation === "binary",
                ).length,
              ),
            ],
          ],
        },
      ])
    : writeXlsxFile(data, { sheet, columns });
  const blob = await output.toBlob();
  const contents = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const mtime = new Date(2026, 0, 1);
  return zipSync(
    Object.fromEntries(
      Object.keys(contents)
        .sort()
        .map((name) => [name, [contents[name]!, { mtime }]]),
    ),
    { level: 6, mtime },
  );
}

export function humanDataset(records: readonly AdminSubjectSummary[]): {
  headers: string[];
  rows: ExportCell[][];
} {
  const headers = [
    "Hasta Kodu",
    "Araştırma Sıra Numarası",
    "Bölüm 4 Durumu",
    ...fields.map(
      ({ field, section }) =>
        `Bölüm ${section} · ${getFieldAccessibleLabel(field)}${field.unit ? ` (${field.unit})` : ""}`,
    ),
    "Toplam Tedavi Süresi (ay)",
    "Eski Ortak DVT Lokalizasyonları (Doğrulanmamış)",
  ];
  const rows = orderedRecords(records).map((record) => {
    const { values } = contextFor(record);
    return [
      record.subjectCode,
      record.subjectNumber,
      investigationLabels[investigationState(record.investigations)],
      ...fields.map(({ field }): ExportCell => {
        if (!isFieldVisible(field, values)) return null;
        const answer = values[field.id];
        if (Array.isArray(answer))
          return answer.length ? answer.join("; ") : null;
        if (field.kind === "number" || field.id === "bmi") {
          // Preserve an unparseable original (e.g. a clinical threshold) as text
          // in human Excel; SPSS numeric export uses missing rather than guessing.
          return (
            numericValue(answer) ??
            (typeof answer === "string" && answer.trim() ? answer : null)
          );
        }
        return typeof answer === "string" && answer.trim() ? answer : null;
      }),
      numericValue(record.publicValues.treatmentDurationTotalMonths),
      values.legacyDvtLocations?.join("; ") ?? null,
    ];
  });
  return { headers, rows };
}
export async function buildHumanExcel(
  records: readonly AdminSubjectSummary[],
): Promise<Uint8Array> {
  const { headers, rows } = humanDataset(records);
  return workbook(headers, rows, "CRF");
}
export async function buildSpssExcel(
  records: readonly AdminSubjectSummary[],
): Promise<Uint8Array> {
  const rows = spssDataset(records);
  for (const row of rows)
    for (const value of row) {
      if (typeof value === "string" && encoder.encode(value).length > 32767)
        throw new Error("SPSS metin sınırı aşılıyor; veri kesilmedi.");
    }
  return workbook(
    spssSchema.map((variable) => variable.name),
    rows,
    "Data",
  );
}
export async function buildCodebook(): Promise<Uint8Array> {
  return workbook(dictionaryHeaders, dictionaryRows(), "Codebook", true);
}
const quote = (value: string) =>
  `'${value.replace(/[\r\n]+/g, " ").replaceAll("'", "''")}'`;
export function buildSyntax(records?: readonly AdminSubjectSummary[]): string {
  const rows = records ? spssDataset(records) : null;
  const lines = [
    `* TEZFORM SPSS schema ${SCHEMA_VERSION}. UTF-8.`,
    "* Edit FILE below or set the working directory to the extracted ZIP folder.",
    "SET UNICODE=ON.",
    "GET DATA /TYPE=XLSX /FILE='tezform_spss_data.xlsx' /SHEET=name 'Data' /CELLRANGE=FULL /READNAMES=ON.",
    "DATASET NAME Tezform.",
  ];
  for (const [index, variable] of spssSchema.entries()) {
    const width = rows
      ? rows.reduce(
          (max, row) =>
            Math.max(
              max,
              typeof row[index] === "string"
                ? encoder.encode(row[index]).length
                : 0,
            ),
          1,
        )
      : 32767;
    const format =
      variable.dataType === "string"
        ? `A${width}`
        : variable.measurementLevel === "scale"
          ? "F24.10"
          : "F20.0";
    lines.push(
      `ALTER TYPE ${variable.name} (${format}).`,
      `VARIABLE LABELS ${variable.name} ${quote(variable.label)}.`,
      `VARIABLE LEVEL ${variable.name} (${variable.measurementLevel.toUpperCase()}).`,
      `FORMATS ${variable.name} (${format}).`,
      `MISSING VALUES ${variable.name} ${variable.dataType === "string" ? "(' ')" : "()"}.`,
    );
    if (variable.valueLabels.length)
      lines.push(
        `VALUE LABELS ${variable.name} ${variable.valueLabels.map((item) => `${item.value} ${quote(item.label)}`).join(" ")}.`,
      );
  }
  return "\uFEFF" + [...lines, "EXECUTE.", ""].join("\r\n");
}
export function packageReadme(count: number, scope: RecordScope): string {
  return `TEZFORM – SPSS aktarım paketi\nŞema Versiyonu: ${SCHEMA_VERSION}\nKapsam: ${scope === "all" ? "Tüm yetkili kayıtlar" : "Filtrelenmiş kayıtlar"}\nKayıt sayısı: ${count}\nDeğişken sayısı: ${spssSchema.length}\n\nZIP'i tek klasöre çıkarın. SPSS'te tezform_spss_syntax.sps dosyasını UTF-8 olarak açın; GET DATA satırındaki FILE yolunu XLSX dosyasının tam yoluyla değiştirin veya çalışma klasörünü ayarlayın. Syntax veri dosyasını içeri alır, sayısal/metin türlerini, etiketleri, ölçümleri ve missing tanımlarını uygular. Gerçek .sav dosyası bu pakette üretilmez; gerekirse SPSS'te kaydedin.\n\nHer kayıt tek satırdır; AHT numarasıyla artan sıralıdır. Export salt okunurdur; Firestore/counter/receipt değişmez. Klinik analiz veya istatistiksel yorum yapılmaz. Kimlik alanları metindir; baştaki sıfırlar korunur. Sayısal hücreler gerçek sayıdır. Syntax formatları görüntüleme içindir; kaynaktaki değerler yuvarlanmaz. Tarih YYYY-MM-DD ve saat HH:mm metinleridir; timezone tahmini yapılmaz.\n\nMissing: sayısal boş/geçersiz/uygulanamaz cevaplar XLSX'te boş ve SPSS'te SYSMIS; klinik 0 ile karıştırılmaz. Sentinel 999 üretilmez. Sayısala çevrilemeyen eşik/bozuk laboratuvar metni SPSS'te missing kalır; normal Türkçe Excel özgün metni korur. Çoklu seçim yanıtlanmışsa seçilen seçenek 1, diğerleri 0; yanıtsız veya koşulu geçersiz alanların tamamı missing'dir.\n\nEski unilateral DVT güvenle eşlenir. Eski bilateral veya tarafsız ortak lokalizasyonlar tahmin edilmez; legacy_dvt_unresolved=1 olur ve kaynak ortak metin legacy_dvt_shared_locations içinde korunur. Sağ/Sol lokalizasyonları doğrulanana kadar ilgili binary değişkenler missing kalır.\n\nCodebook, veri sütunları, syntax, uygulama sözlüğü ve PDF aynı merkezi schema'dan üretilir. Kişisel/klinik veri içerir; dosyaları kurumunuzun yetkili araştırma ortamında saklayın.\n`;
}
export async function buildSpssPackage(
  records: readonly AdminSubjectSummary[],
  scope: RecordScope,
): Promise<Uint8Array> {
  const [data, codebook] = await Promise.all([
    buildSpssExcel(records),
    buildCodebook(),
  ]);
  // Fixed metadata keeps packaging deterministic; no wall-clock timestamps or identifiers are invented.
  const mtime = new Date(2026, 0, 1);
  return zipSync(
    {
      "tezform_spss_data.xlsx": [data, { mtime }],
      "tezform_spss_syntax.sps": [strToU8(buildSyntax(records)), { mtime }],
      "tezform_spss_codebook.xlsx": [codebook, { mtime }],
      "README.txt": [strToU8(packageReadme(records.length, scope)), { mtime }],
    },
    { level: 6, mtime },
  );
}
