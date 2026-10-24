import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { createEmptyCrf, crfSections } from "../src/components/crf/sections.ts";
import { toCrfValues } from "../src/components/crf/calculations.ts";
import type { AdminSubjectSummary } from "../src/services/adminRecords.ts";
import {
  emptyRecordFilters,
  filterResearchSubjects,
} from "../src/services/researchData.ts";
import {
  CRF_SOURCE_FIELD_COUNT,
  dictionaryDisplayRow,
  dictionaryRows,
  filterDictionary,
  numericValue,
  SCHEMA_VERSION,
  spssDataset,
  spssSchema,
} from "../src/export/spssSchema.ts";
import {
  buildCodebook,
  buildHumanExcel,
  buildSpssExcel,
  buildSpssPackage,
  buildSyntax,
  humanDataset,
} from "../src/export/exportEngine.ts";
import { buildDictionaryPdf } from "../src/export/dictionaryPdf.ts";

function record(number = 0): AdminSubjectSummary {
  const values = createEmptyCrf();
  values.nationalId = "00123456789";
  values.sex = "Kadın";
  values.age = "45";
  values.weight = "80";
  values.height = "180";
  values.bmi = 24.7;
  values.treatmentDurationYears = "3";
  values.treatmentDurationMonths = "4";
  values.researchNotes = '=HYPERLINK("https://example.invalid")';
  values.otherAntithrombotic = ["Hayır"];
  values.nsaid = "Hayır";
  values.nsaidFrequency = "Düzenli"; // Hidden stale follow-up.
  const investigations = Object.fromEntries(
    crfSections
      .find((section) => section.number === 4)!
      .fields.map((field) => [
        field.id,
        field.kind === "multiselect" ? [] : "1.25",
      ]),
  );
  Object.assign(investigations, {
    dvtSide: ["Sağ", "Sol"],
    dvtRightLocations: ["Femoral", "Popliteal"],
    dvtLeftLocations: ["İliak"],
    bun: "0",
  });
  return {
    id: String(number).padStart(20, "0"),
    subjectCode: `AHT-${String(number).padStart(3, "0")}`,
    subjectNumber: number,
    status: "pending_completion",
    createdAt: null,
    updatedAt: null,
    publicValues: toCrfValues(values),
    investigations,
  } as AdminSubjectSummary;
}
const index = (name: string) => {
  const result = spssSchema.findIndex((variable) => variable.name === name);
  assert(result >= 0, name);
  return result;
};
const decode = (value: string) =>
  value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, name: string) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]!,
  );
function xlsx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const shared = [
    ...strFromU8(files["xl/sharedStrings.xml"]!).matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map((match) =>
    [...match[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decode(part[1]!))
      .join(""),
  );
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]!);
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(
    (row) => {
      const values: Array<string | number | null> = [];
      for (const cell of row[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const ref = /\br="([A-Z]+)\d+"/.exec(cell[1]!)![1]!;
        let column = 0;
        for (const letter of ref)
          column = column * 26 + letter.charCodeAt(0) - 64;
        const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2]!)?.[1];
        values[column - 1] =
          value === undefined
            ? null
            : /\bt="s"/.test(cell[1]!)
              ? shared[Number(value)]!
              : Number(value);
      }
      return values;
    },
  );
  return { rows, xml, files };
}

test("SPSS 1.0 names, field mappings, option codes and binary variables are complete, unique and stable", () => {
  assert.equal(SCHEMA_VERSION, "1.0");
  assert.equal(CRF_SOURCE_FIELD_COUNT, 71);
  assert.equal(spssSchema.length, 102);
  assert.equal(
    new Set(spssSchema.map((variable) => variable.name)).size,
    spssSchema.length,
  );
  for (const variable of spssSchema) {
    assert(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(variable.name));
    assert(
      ![
        "ALL",
        "AND",
        "BY",
        "EQ",
        "GE",
        "GT",
        "LE",
        "LT",
        "NE",
        "NOT",
        "OR",
        "TO",
        "WITH",
      ].includes(variable.name.toUpperCase()),
    );
    assert.equal(
      new Set(variable.valueLabels.map((item) => item.value)).size,
      variable.valueLabels.length,
    );
    assert(variable.missingPolicy && variable.description && variable.label);
  }
  for (const field of crfSections.flatMap((section) => section.fields)) {
    const variables = spssSchema.filter(
      (variable) => variable.sourceField === field.id,
    );
    assert.equal(
      variables.length,
      field.kind === "multiselect" ? field.options.length : 1,
    );
    if (field.kind === "multiselect")
      assert.deepEqual(
        variables.map((variable) => variable.option),
        field.options,
      );
    else if (field.kind === "radio" || field.kind === "select")
      assert.deepEqual(
        variables[0]!.valueLabels.map((item) => item.label),
        field.options,
      );
  }
  assert.equal(
    spssSchema.filter((variable) => variable.transformation === "binary")
      .length,
    31,
  );
  assert.equal(
    spssSchema.filter(
      (variable) => variable.sourceField === "dvtRightLocations",
    ).length,
    7,
  );
  assert.equal(
    spssSchema.filter((variable) => variable.sourceField === "dvtLeftLocations")
      .length,
    7,
  );
  assert.equal(
    spssSchema.find((variable) => variable.sourceField === "nationalId")?.name,
    "national_id",
  );
  assert.equal(
    spssSchema.find((variable) => variable.sourceField === "bun")?.unit,
    "mg/dL",
  );
  const signature = spssSchema.map(
    ({
      name,
      sourceField,
      dataType,
      measurementLevel,
      unit,
      option,
      valueLabels,
      transformation,
      derivedFrom,
    }) => ({
      name,
      sourceField,
      dataType,
      measurementLevel,
      unit,
      transformation,
      ...(option ? { option } : {}),
      ...(derivedFrom ? { derivedFrom } : {}),
      valueLabels,
    }),
  );
  assert.deepEqual(
    signature,
    JSON.parse(
      readFileSync(
        new URL("./fixtures/spss-schema-v1.json", import.meta.url),
        "utf8",
      ),
    ),
  );
});
test("numeric conversion preserves zero/precision and treats missing or uninterpretable clinical values separately", () => {
  for (const value of [null, "", " ", "1abc", "<5", "NaN", Infinity, "1,234.5"])
    assert.equal(numericValue(value), null);
  assert.equal(numericValue("0"), 0);
  assert.equal(numericValue("12,75"), 12.75);
  assert.equal(numericValue("1.23456789"), 1.23456789);
  const row = spssDataset([record()])[0]!;
  assert.equal(row[index("national_id")], "00123456789");
  assert.equal(row[index("bun")], 0);
  assert.equal(row[index("creatinine")], 1.25);
  assert.equal(row[index("treatment_duration_total_months")], 40);
  assert.equal(row[index("other_antithrombotic_no")], 1);
  assert.equal(row[index("other_antithrombotic_aspirin")], 0);
  assert.equal(row[index("inhibitors_none")], null);
  assert.equal(row[index("nsaid_frequency")], null);
});
test("DVT right/left binary values are independent and legacy ambiguities are never guessed", () => {
  const subject = record();
  let row = spssDataset([subject])[0]!;
  assert.equal(row[index("dvt_right_locations_femoral")], 1);
  assert.equal(row[index("dvt_left_locations_femoral")], 0);
  assert.equal(row[index("dvt_left_locations_iliac")], 1);
  subject.investigations = { dvtSide: ["Sağ"], dvtLocations: ["Popliteal"] };
  row = spssDataset([subject])[0]!;
  assert.equal(row[index("dvt_right_locations_popliteal")], 1);
  assert.equal(row[index("dvt_left_locations_popliteal")], null);
  for (const sides of [["Sağ", "Sol"], []]) {
    subject.investigations = { dvtSide: sides, dvtLocations: ["Popliteal"] };
    row = spssDataset([subject])[0]!;
    assert.equal(row[index("legacy_dvt_unresolved")], 1);
    assert.equal(row[index("legacy_dvt_shared_locations")], "Popliteal");
    assert.equal(row[index("dvt_right_locations_popliteal")], null);
    assert.equal(row[index("dvt_left_locations_popliteal")], null);
  }
});
test("dataset, codebook, syntax and dictionary share exactly the same schema columns and labels", async () => {
  const names = spssSchema.map((variable) => variable.name);
  const data = xlsx(await buildSpssExcel([record()]));
  assert.deepEqual(data.rows[0], names);
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[1]![index("creatinine")], 1.25);
  assert.equal(typeof data.rows[1]![index("creatinine")], "number");
  assert.equal(data.rows[1]![index("national_id")], "00123456789");
  assert(!/<f[\s>]/.test(data.xml), "free text must never become a formula");
  const codebook = xlsx(await buildCodebook());
  assert(codebook.files["xl/worksheets/sheet2.xml"]);
  assert(
    strFromU8(codebook.files["xl/sharedStrings.xml"]!).includes(
      "Schema Version",
    ),
  );
  assert(strFromU8(codebook.files["xl/sharedStrings.xml"]!).includes("1.0"));
  assert.deepEqual(
    codebook.rows.slice(1).map((row) => row[0]),
    names,
  );
  assert.deepEqual(
    dictionaryRows().map((row) => row[0]),
    names,
  );
  assert.deepEqual(
    spssSchema.map((variable) => dictionaryDisplayRow(variable)[0]),
    names,
  );
  const syntax = buildSyntax([record()]);
  assert.deepEqual(
    [...syntax.matchAll(/^VARIABLE LABELS (\w+) /gm)].map((match) => match[1]),
    names,
  );
  assert.deepEqual(
    [...syntax.matchAll(/^VARIABLE LEVEL (\w+) /gm)].map((match) => match[1]),
    names,
  );
  assert.deepEqual(
    [...syntax.matchAll(/^MISSING VALUES (\w+) /gm)].map((match) => match[1]),
    names,
  );
  for (const variable of spssSchema)
    if (variable.valueLabels.length)
      assert(syntax.includes(`VALUE LABELS ${variable.name} `));
  assert(syntax.includes("Şema") || syntax.includes("schema 1.0"));
  assert(syntax.includes("St. John''s Wort"));
});
test("human Excel retains all sections and original uninterpretable laboratory text without changing data", async () => {
  const subject = record();
  subject.investigations.bun = "<5";
  const before = structuredClone(subject);
  const human = humanDataset([subject]);
  for (let section = 1; section <= 7; section++)
    assert(
      human.headers.some((header) => header.startsWith(`Bölüm ${section} ·`)),
    );
  const data = xlsx(await buildHumanExcel([subject]));
  assert.equal(data.rows.length, 2);
  const bun = human.headers.findIndex((header) => header.includes("BUN:"));
  assert.equal(data.rows[1]![bun], "<5");
  assert(!/<f[\s>]/.test(data.xml));
  assert.equal(spssDataset([subject])[0]![index("bun")], null);
  assert.deepEqual(subject, before);
});
test("filtered/all packages use only their supplied scope, produce four files and do not mutate records", async () => {
  const all = [record(2), record(0), record(1)];
  const before = structuredClone(all);
  Object.freeze(all);
  const filtered = filterResearchSubjects(all, {
    ...emptyRecordFilters,
    code: "AHT-001",
  });
  for (const [records, scope, count] of [
    [filtered, "filtered", 1],
    [all, "all", 3],
  ] as const) {
    const archive = unzipSync(await buildSpssPackage(records, scope));
    assert.deepEqual(Object.keys(archive).sort(), [
      "README.txt",
      "tezform_spss_codebook.xlsx",
      "tezform_spss_data.xlsx",
      "tezform_spss_syntax.sps",
    ]);
    assert.equal(
      xlsx(archive["tezform_spss_data.xlsx"]!).rows.length,
      count + 1,
    );
    assert(
      strFromU8(archive["README.txt"]!).includes(`Kayıt sayısı: ${count}`),
    );
    assert(strFromU8(archive["README.txt"]!).includes("Şema Versiyonu: 1.0"));
  }
  assert.deepEqual(all, before);
  assert.deepEqual(
    await buildSpssPackage(filtered, "filtered"),
    await buildSpssPackage(filtered, "filtered"),
  );
});
test("dictionary search and section filters query the schema without altering variable names", () => {
  assert.equal(filterDictionary("DVT_RIGHT_LOCATIONS").length, 7);
  assert.equal(filterDictionary("dvtRightLocations").length, 7);
  assert(
    filterDictionary("Kreatinin", "4").some(
      (variable) => variable.name === "creatinine",
    ),
  );
  assert(filterDictionary("", "7").every((variable) => variable.section === 7));
});

test("Phase C owns selection while Phase D has no Firebase or independent filtering dependency", () => {
  for (const file of [
    "components/ResearchDataCenter.tsx",
    "services/researchData.ts",
  ]) {
    const source = readFileSync(
      new URL(`../src/${file}`, import.meta.url),
      "utf8",
    );
    assert(
      !/SPSS|Codebook|spssSchema|write-excel-file|pdf-lib|fflate/.test(source),
    );
    assert(!/from\s+["'][^"']*firebase/.test(source));
  }
  for (const file of ["exportEngine.ts", "spssSchema.ts", "dictionaryPdf.ts"]) {
    const source = readFileSync(
      new URL(`../src/export/${file}`, import.meta.url),
      "utf8",
    );
    assert(
      !/from\s+["'][^"']*(?:firebase|researchData|registration|adminStore)[^"']*["']/.test(
        source,
      ),
    );
    assert(
      !/filterResearchSubjects|setDoc\(|updateDoc\(|deleteDoc\(|runTransaction\(/.test(
        source,
      ),
    );
  }
});
test("PDF dictionary embeds Turkish font, all schema identities and multiple pages", async () => {
  const font = new Uint8Array(
    readFileSync(
      new URL("../public/fonts/NotoSans-Regular.ttf", import.meta.url),
    ),
  );
  const bytes = await buildDictionaryPdf(font);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getTitle(), "TEZFORM – SPSS Veri Sözlüğü");
  assert.equal(document.getSubject(), "Şema Versiyonu: 1.0");
  assert.equal(
    document.getKeywords(),
    spssSchema.map((variable) => variable.name).join(" "),
  );
  assert(document.getPageCount() > 1);
  writeFileSync("/tmp/tezform-spss-dictionary.pdf", bytes);
});
