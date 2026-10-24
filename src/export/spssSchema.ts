import {
  crfSections,
  getFieldAccessibleLabel,
  isFieldVisible,
} from "../components/crf/sections.ts";
import {
  createAdminRecordDraft,
  investigationState,
} from "../services/adminModel.ts";
import type { AdminSubjectSummary } from "../services/adminRecords.ts";
import type { CrfDraftValues, FieldId, MultiFieldId } from "../types/crf.ts";

export const SCHEMA_VERSION = "1.0";
export type ExportCell = string | number | null;
export interface ExportContext {
  record: AdminSubjectSummary;
  values: CrfDraftValues;
}
export interface SpssVariable {
  name: string;
  sourceField:
    | FieldId
    | "subjectCode"
    | "subjectNumber"
    | "investigations"
    | "treatmentDurationTotalMonths"
    | "dvtLocations";
  label: string;
  section: number;
  dataType: "numeric" | "string";
  measurementLevel: "nominal" | "ordinal" | "scale";
  valueLabels: readonly { value: number; label: string }[];
  missingPolicy: string;
  unit: string;
  transformation: "text" | "number" | "category" | "binary" | "derived";
  option?: string;
  derivedFrom?: readonly string[];
  description: string;
  read: (context: ExportContext) => ExportCell;
}

export const numericMissingPolicy =
  "Boş/geçersiz/uygulanamaz değer XLSX'te boş, SPSS'te SYSMIS. 0 geçerli veridir; sentinel kod kullanılmaz.";
const binaryMissingPolicy =
  "Yanıtlanmış seçim: 1=Evet, 0=Hayır. Yanıtsız/uygulanamaz/belirsiz eski DVT: boş (SYSMIS).";
const textMissingPolicy =
  "Boş/uygulanamaz değer boş hücredir. Diğer metin aynen korunur; sayısal kod uydurulmaz.";

/** Strict conversion: never accepts a numeric prefix or invents zero from blanks. */
export function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}
const snake = (id: string) =>
  id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

// Machine suffixes are versioned identifiers, independent of Turkish display labels.
// Options and clinical text themselves always come from canonical CRF metadata.
const binaryKeys: Record<MultiFieldId, readonly string[]> = {
  otherAntithrombotic: ["no", "aspirin", "clopidogrel_ticagrelor", "heparin"],
  inhibitors: [
    "amiodarone",
    "verapamil",
    "diltiazem",
    "ketoconazole_itraconazole",
    "clarithromycin",
    "none",
  ],
  inducers: [
    "rifampicin",
    "carbamazepine",
    "phenytoin",
    "st_johns_wort",
    "none",
  ],
  dvtSide: ["right", "left"],
  dvtRightLocations: [
    "iliac",
    "femoral",
    "popliteal",
    "upper_extremity",
    "ivc",
    "svc",
    "jugular",
  ],
  dvtLeftLocations: [
    "iliac",
    "femoral",
    "popliteal",
    "upper_extremity",
    "ivc",
    "svc",
    "jugular",
  ],
};
const noLabels = [] as const;
const fields = crfSections.flatMap((section) =>
  section.fields.map((field) => ({ field, section: section.number })),
);
export const CRF_SOURCE_FIELD_COUNT = fields.length;

const clinicalVariables: SpssVariable[] = fields.flatMap(
  ({ field, section }): SpssVariable[] => {
    const label = getFieldAccessibleLabel(field);
    const common = {
      sourceField: field.id,
      label,
      section,
      unit: field.unit ?? "",
    };
    const active = (context: ExportContext) =>
      isFieldVisible(field, context.values);
    if (field.kind === "multiselect") {
      if (binaryKeys[field.id].length !== field.options.length)
        throw new Error("SPSS schema option contract mismatch");
      return field.options.map((option, index) => ({
        ...common,
        name: `${snake(field.id)}_${binaryKeys[field.id][index]!}`,
        label: `${label} — ${option}`,
        dataType: "numeric",
        measurementLevel: "nominal",
        transformation: "binary",
        derivedFrom: [field.id],
        option,
        valueLabels: [
          { value: 0, label: "Hayır" },
          { value: 1, label: "Evet" },
        ],
        missingPolicy: binaryMissingPolicy,
        description:
          "Canonical çoklu seçimden bağımsız binary değişken; seçilmeyen tarafın lokalizasyonu uygulanamazdır.",
        read: (context) => {
          const answer = context.values[field.id];
          return !active(context) ||
            !Array.isArray(answer) ||
            !answer.length ||
            new Set(answer).size !== answer.length ||
            answer.some((item) => !field.options.includes(item))
            ? null
            : answer.includes(option)
              ? 1
              : 0;
        },
      }));
    }
    if (field.kind === "radio" || field.kind === "select") {
      const hasNo = field.options.includes("Hayır");
      const valueLabels = field.options.map((option, index) => ({
        value: hasNo ? index : index + 1,
        label: option,
      }));
      return [
        {
          ...common,
          name: snake(field.id),
          dataType: "numeric",
          measurementLevel: "nominal",
          transformation: "category",
          valueLabels,
          missingPolicy: numericMissingPolicy,
          description:
            "Kod sırası şema 1.0 sözleşmesidir. Bilinmiyor/Uygulanamaz gibi açık seçenekler kendi kategori kodlarını korur.",
          read: (context) => {
            if (!active(context)) return null;
            const index = field.options.indexOf(
              String(context.values[field.id] ?? ""),
            );
            return index < 0 ? null : valueLabels[index]!.value;
          },
        },
      ];
    }
    const numeric = field.kind === "number" || field.id === "bmi";
    return [
      {
        ...common,
        name: snake(field.id),
        dataType: numeric ? "numeric" : "string",
        measurementLevel: numeric ? "scale" : "nominal",
        transformation:
          field.id === "bmi" ? "derived" : numeric ? "number" : "text",
        ...(field.id === "bmi" ? { derivedFrom: ["weight", "height"] } : {}),
        valueLabels: noLabels,
        missingPolicy: numeric ? numericMissingPolicy : textMissingPolicy,
        description:
          field.id === "bmi"
            ? "Kayıtlı sayısal VKİ; boy/kilodan türetilmiş kaynak değer export'ta yeniden hesaplanmaz."
            : field.kind === "date"
              ? "Takvim tarihi YYYY-MM-DD metni; timezone dönüşümü yok."
              : field.kind === "time"
                ? "Saat HH:mm metni; otomatik saat/tarih varsayımı yok."
                : numeric
                  ? "Sonlu sayısal değer; nokta/tek ondalık virgül kabul edilir, eşik ifadeleri veya bozuk değerler tahmin edilmez."
                  : "Metin; TC Kimlik No dahil baştaki sıfırlar ve serbest metin korunur.",
        read: (context) => {
          if (!active(context)) return null;
          const answer = context.values[field.id];
          return numeric
            ? numericValue(answer)
            : typeof answer === "string" && answer.trim()
              ? answer
              : null;
        },
      },
    ];
  },
);

const schemaDefinition: SpssVariable[] = [
  {
    name: "subject_code",
    sourceField: "subjectCode",
    label: "Hasta Kodu",
    section: 1,
    dataType: "string",
    measurementLevel: "nominal",
    valueLabels: noLabels,
    missingPolicy: textMissingPolicy,
    unit: "",
    transformation: "text",
    description: "Tahsis edilmiş AHT kodu; yalnız okunur.",
    read: ({ record }) => record.subjectCode,
  },
  {
    name: "subject_number",
    sourceField: "subjectNumber",
    label: "Araştırma sıra numarası",
    section: 1,
    dataType: "numeric",
    measurementLevel: "nominal",
    valueLabels: noLabels,
    missingPolicy: numericMissingPolicy,
    unit: "",
    transformation: "number",
    description: "Mevcut kaydın monotonik sıra numarası; counter'a erişmez.",
    read: ({ record }) => record.subjectNumber,
  },
  ...clinicalVariables,
  {
    name: "treatment_duration_total_months",
    sourceField: "treatmentDurationTotalMonths",
    label: "Toplam tedavi süresi (ay)",
    section: 2,
    dataType: "numeric",
    measurementLevel: "scale",
    valueLabels: noLabels,
    missingPolicy: numericMissingPolicy,
    unit: "ay",
    transformation: "derived",
    derivedFrom: ["treatmentDurationYears", "treatmentDurationMonths"],
    description: "Kayıtlı canonical toplam süre; yeni klinik tahmin yapılmaz.",
    read: ({ record }) =>
      numericValue(record.publicValues.treatmentDurationTotalMonths),
  },
  {
    name: "record_state",
    sourceField: "investigations",
    label: "Bölüm 4 tamamlama durumu",
    section: 4,
    dataType: "numeric",
    measurementLevel: "nominal",
    valueLabels: [
      { value: 0, label: "Boş" },
      { value: 1, label: "Devam Et" },
      { value: 2, label: "Tamamlandı" },
    ],
    missingPolicy: numericMissingPolicy,
    unit: "",
    transformation: "derived",
    derivedFrom: ["investigations"],
    description:
      "Mevcut canonical/legacy cevaplardan operasyonel durum; klinik outcome değildir.",
    read: ({ record }) =>
      ({ empty: 0, partial: 1, complete: 2 })[
        investigationState(record.investigations)
      ],
  },
  {
    name: "legacy_dvt_unresolved",
    sourceField: "dvtLocations",
    label: "Eski DVT taraf/lokalizasyon dağılımı doğrulama bekliyor",
    section: 4,
    dataType: "numeric",
    measurementLevel: "nominal",
    valueLabels: [
      { value: 0, label: "Hayır" },
      { value: 1, label: "Evet" },
    ],
    missingPolicy:
      "0=belirsiz legacy veri yok, 1=doğrulama bekliyor; klinik yanıt değildir.",
    unit: "",
    transformation: "derived",
    derivedFrom: ["dvtLocations", "dvtSide"],
    description:
      "Tarafsız/bilateral ortak legacy lokalizasyonlar taraflara kopyalanmaz; ilgili lokasyon değişkenleri missing kalır.",
    read: ({ values }) => (values.legacyDvtLocations?.length ? 1 : 0),
  },
  {
    name: "legacy_dvt_shared_locations",
    sourceField: "dvtLocations",
    label: "Eski ortak DVT lokalizasyonları (dağılımı doğrulanmamış)",
    section: 4,
    dataType: "string",
    measurementLevel: "nominal",
    valueLabels: noLabels,
    missingPolicy: textMissingPolicy,
    unit: "",
    transformation: "derived",
    derivedFrom: ["dvtLocations"],
    description:
      "Yalnız çözümlenmemiş legacy ortak kaynak metni; Sağ/Sol binary değişkenlerine tahminle dağıtılmaz.",
    read: ({ values }) =>
      values.legacyDvtLocations?.length
        ? values.legacyDvtLocations.join("; ")
        : null,
  },
];
export const spssSchema: readonly SpssVariable[] = Object.freeze(
  schemaDefinition.map((variable) =>
    Object.freeze({
      ...variable,
      valueLabels: Object.freeze(
        variable.valueLabels.map((item) => Object.freeze({ ...item })),
      ),
      ...(variable.derivedFrom
        ? { derivedFrom: Object.freeze([...variable.derivedFrom]) }
        : {}),
    }),
  ),
);

export function contextFor(record: AdminSubjectSummary): ExportContext {
  return { record, values: createAdminRecordDraft(record) };
}
export function orderedRecords(
  records: readonly AdminSubjectSummary[],
): AdminSubjectSummary[] {
  return records.toSorted(
    (a, b) => a.subjectNumber - b.subjectNumber || a.id.localeCompare(b.id),
  );
}
export function spssDataset(
  records: readonly AdminSubjectSummary[],
): ExportCell[][] {
  return orderedRecords(records).map((record) => {
    const context = contextFor(record);
    return spssSchema.map((variable) => variable.read(context));
  });
}
export function dictionaryRows(): ExportCell[][] {
  return spssSchema.map((variable) => [
    variable.name,
    variable.label,
    variable.section,
    variable.sourceField,
    variable.dataType,
    variable.measurementLevel,
    variable.valueLabels
      .map((item) => `${item.value} = ${item.label}`)
      .join("; "),
    variable.missingPolicy,
    variable.unit,
    variable.description,
  ]);
}
export const dictionaryHeaders = [
  "Variable Name",
  "Variable Label",
  "CRF Bölümü",
  "CRF Field Key",
  "Data Type",
  "Measurement Level",
  "Value Codes / Labels",
  "Missing Value",
  "Unit",
  "Açıklama",
] as const;
export const dictionaryDisplayHeaders = [
  "SPSS Değişkeni",
  "CRF Alanı",
  "Açıklama",
  "Bölüm",
  "Tür",
  "Ölçüm",
  "Kodlama",
  "Birim",
] as const;
export function dictionaryDisplayRow(variable: SpssVariable): string[] {
  return [
    variable.name,
    variable.sourceField,
    variable.label,
    String(variable.section),
    variable.dataType,
    variable.measurementLevel,
    variable.valueLabels
      .map((item) => `${item.value} = ${item.label}`)
      .join("; "),
    variable.unit,
  ];
}

export function filterDictionary(
  search = "",
  section = "all",
): readonly SpssVariable[] {
  const fold = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replaceAll("ı", "i");
  const needle = fold(search.trim());
  return spssSchema.filter(
    (variable) =>
      (section === "all" || String(variable.section) === section) &&
      (!needle ||
        fold(
          [
            variable.name,
            variable.label,
            variable.sourceField,
            variable.description,
          ].join(" "),
        ).includes(needle)),
  );
}
