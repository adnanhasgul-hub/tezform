import type {
  CrfContext,
  CrfSection,
  CrfValues,
  DigitalCrfContext,
} from "../../types/crf";

const yesNoUnknown = ["Evet", "Hayır", "Bilinmiyor"] as const;

// Draft UI fields; no clinical score, diagnosis or eligibility decision is calculated here.
export const crfSections: readonly CrfSection[] = [
  {
    id: "demographics",
    number: 1,
    shortTitle: "Demografi",
    entryRole: "public",
    title: "Demografik ve Temel Klinik Bilgiler",
    description: "Katılımcı kodu ve temel klinik değerlendirme alanları.",
    fields: [
      {
        id: "participantCode",
        label: "Araştırma katılımcı kodu",
        kind: "text",
        required: true,
        hint: "Ad, soyad veya kimlik numarası kullanmayın.",
      },
      {
        id: "age",
        label: "Yaş (yıl)",
        kind: "number",
        required: true,
        min: 0,
        max: 120,
      },
      {
        id: "sex",
        label: "Cinsiyet",
        kind: "select",
        required: true,
        options: ["Kadın", "Erkek", "Diğer", "Belirtilmemiş"],
      },
      {
        id: "weight",
        label: "Vücut ağırlığı (kg)",
        kind: "number",
        required: true,
        min: 0,
        step: "0.1",
      },
      {
        id: "height",
        label: "Boy (cm)",
        kind: "number",
        required: true,
        min: 0,
        step: "0.1",
      },
      {
        id: "indication",
        label: "Apixaban kullanım endikasyonu",
        kind: "text",
        required: true,
      },
    ],
  },
  {
    id: "apixaban",
    number: 2,
    shortTitle: "Apixaban",
    entryRole: "public",
    title: "Apixaban Kullanımı ve Uyum",
    description: "Doz, kullanım süresi ve tedaviye uyum bilgileri.",
    fields: [
      {
        id: "dose",
        label: "Tek doz miktarı (mg)",
        kind: "select",
        required: true,
        options: ["2,5 mg", "5 mg", "Diğer", "Bilinmiyor"],
      },
      {
        id: "frequency",
        label: "Kullanım sıklığı",
        kind: "select",
        required: true,
        options: ["Günde 1 kez", "Günde 2 kez", "Diğer", "Bilinmiyor"],
      },
      {
        id: "treatmentStart",
        label: "Tedavi başlangıç tarihi",
        kind: "date",
        required: true,
      },
      {
        id: "adherence",
        label: "Tedaviye uyum (araştırmacı bildirimi)",
        kind: "select",
        required: true,
        options: [
          "Düzenli kullanım bildiriyor",
          "Düzensiz kullanım bildiriyor",
          "Değerlendirilemedi",
        ],
      },
      {
        id: "missedDoses",
        label: "Son 7 günde atlanan doz sayısı",
        kind: "number",
        required: true,
        min: 0,
      },
    ],
  },
  {
    id: "medications",
    number: 3,
    shortTitle: "İlaçlar",
    entryRole: "public",
    title: "Eş Zamanlı İlaç Kullanımı",
    description:
      "Apixaban dışında kullanılan ilaçlar. Antiagregan uygunluğu üst bölümden değerlendirilir.",
    fields: [
      {
        id: "otherAnticoagulant",
        label: "Başka antikoagülan kullanımı",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "nsaid",
        label: "NSAİİ kullanımı",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "ssri",
        label: "SSRI / SNRI kullanımı",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "otherMedications",
        label: "Diğer ilaçlar ve dozları",
        kind: "textarea",
        required: false,
      },
    ],
  },
  {
    id: "investigations",
    number: 4,
    shortTitle: "Radyoloji / Lab.",
    entryRole: "admin",
    title: "Radyoloji ve Laboratuvar Bulguları",
    description:
      "Birimleri kontrol ederek bulguları belirtin. Boş alanlar ölçülmemiş olarak kalır.",
    fields: [
      {
        id: "dvtLocations",
        label: "DVT seviyesi/lokalizasyonu",
        kind: "multiselect",
        required: true,
        hint: "Birden fazla seçenek işaretlenebilir.",
        group: "Radyoloji / DVT Bilgileri",
        options: [
          "İliak",
          "Femoral",
          "Popliteal",
          "Üst ekstremite",
          "IVC",
          "SVC",
          "Juguler",
        ],
      },
      {
        id: "dvtSide",
        label: "DVT tarafı",
        kind: "multiselect",
        required: true,
        hint: "Birden fazla seçenek işaretlenebilir.",
        group: "Radyoloji / DVT Bilgileri",
        options: ["Sağ", "Sol"],
      },
      {
        id: "bun",
        label: "BUN (mg/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "creatinine",
        label: "Kreatinin (mg/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.01",
      },
      {
        id: "egfr",
        label: "eGFR (mL/dk/1,73 m²)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "calcium",
        label: "Kalsiyum (mg/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "sodium",
        label: "Sodyum (mmol/L)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "potassium",
        label: "Potasyum (mmol/L)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "totalBilirubin",
        label: "Total bilirubin (mg/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.01",
      },
      {
        id: "directBilirubin",
        label: "Direkt bilirubin (mg/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.01",
      },
      {
        id: "ast",
        label: "AST (U/L)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "alt",
        label: "ALT (U/L)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "totalProtein",
        label: "Total protein (g/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "albumin",
        label: "Albumin (g/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "wbc",
        label: "WBC (×10³/µL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "hemoglobin",
        label: "HGB (g/dL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "platelets",
        label: "PLT (×10³/µL)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "hct",
        label: "HCT (%)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "pt",
        label: "PT (sn)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
      {
        id: "inr",
        label: "INR",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.01",
      },
      {
        id: "aptt",
        label: "aPTT (sn)",
        kind: "number",
        required: true,
        group: "Laboratuvar Bulguları",
        min: 0,
        step: "0.1",
      },
    ],
  },
  {
    id: "bleeding-symptoms",
    number: 5,
    shortTitle: "Belirtiler",
    entryRole: "public",
    title: "ISTH Kanama Belirtileri",
    description:
      "Belirti alanları taslaktır; doğrulanmış ISTH ölçeği veya otomatik ISTH skoru değildir.",
    fields: [
      {
        id: "epistaxis",
        label: "Burun kanaması",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "gingivalBleeding",
        label: "Diş eti / ağız içi kanama",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "bruising",
        label: "Ciltte morarma / ekimoz",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "giBleeding",
        label: "Gastrointestinal kanama",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "hematuria",
        label: "Hematüri",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "otherBleeding",
        label: "Diğer kanama belirtileri ve açıklamalar",
        kind: "textarea",
        required: false,
      },
    ],
  },
  {
    id: "severity",
    number: 6,
    shortTitle: "Kanama şiddeti",
    entryRole: "public",
    title: "Kanama Şiddeti ve Sonuçları",
    description:
      "Araştırmacının bildirdiği değerlendirme; uygulama sınıflandırma hesaplamaz.",
    fields: [
      {
        id: "severity",
        label: "Kanama şiddeti (araştırmacı değerlendirmesi)",
        kind: "select",
        required: true,
        options: [
          "Kanama yok",
          "Minör kanama",
          "Klinik olarak anlamlı majör olmayan kanama",
          "Majör kanama",
          "Değerlendirilemedi",
        ],
      },
      {
        id: "hospitalization",
        label: "Kanama nedeniyle hastaneye yatış",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "transfusion",
        label: "Kanama nedeniyle transfüzyon",
        kind: "select",
        required: true,
        options: yesNoUnknown,
      },
      {
        id: "outcome",
        label: "Kanamanın sonucu / açıklama",
        kind: "textarea",
        required: false,
      },
    ],
  },
  {
    id: "researcher",
    number: 7,
    shortTitle: "Araştırmacı",
    entryRole: "public",
    title: "Zamansal İlişki ve Araştırmacı Bilgileri",
    description:
      "Olay zamanlaması ve değerlendirmeyi yapan araştırmacıya ait alanlar.",
    fields: [
      {
        id: "bleedingOnset",
        label: "Kanama başlangıç tarihi ve saati",
        kind: "datetime-local",
        required: false,
      },
      {
        id: "lastDoseAt",
        label: "Kanama öncesi son apixaban dozu tarihi ve saati",
        kind: "datetime-local",
        required: false,
      },
      {
        id: "assessmentDate",
        label: "Değerlendirme tarihi",
        kind: "date",
        required: true,
      },
      {
        id: "investigator",
        label: "Araştırmacı kodu",
        kind: "text",
        required: true,
      },
      {
        id: "researchNotes",
        label: "Araştırmacı notları",
        kind: "textarea",
        required: false,
        hint: "Kimlik belirleyici veya gerçek hasta bilgisi girmeyin.",
      },
    ],
  },
];

export function createEmptyCrf(): CrfValues {
  const values: Partial<CrfValues> = {};
  for (const section of crfSections) {
    for (const field of section.fields) {
      if (field.kind === "multiselect") values[field.id] = [];
      else values[field.id] = "";
    }
  }
  return values as CrfValues;
}

export const investigationsNotice =
  "Radyoloji ve laboratuvar bulguları yönetici tarafından daha sonra tamamlanacaktır.";

export function isSectionEditable(
  section: CrfSection,
  context: CrfContext,
): boolean {
  return (
    context !== "print" &&
    section.entryRole === (context === "digital-public" ? "public" : "admin")
  );
}

export function getEditableSections(
  context: DigitalCrfContext,
): readonly CrfSection[] {
  return crfSections.filter((section) => isSectionEditable(section, context));
}

export const publicSections = getEditableSections("digital-public");
