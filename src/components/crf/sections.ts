import type {
  CrfContext,
  CrfSection,
  CrfDraftValues,
  DigitalCrfContext,
} from "../../types/crf";

import { getLocalCalendarDate, recalculateDerived } from "./calculations.ts";

// Clinical text transcribed from the supplied source; Section 1 laboratory block intentionally excluded.
export const formCopy = {
  title: "ADNAN TEZ FORMU",
  subtitle:
    "Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme\nVeri Toplama Formu (CRF)",
  warning: "* ÖNEMLİ KLİNİK UYARI: HASTADAN MOR TÜP (EDTA) KAN ALINACAKTIR *",
} as const;

export const crfSections: readonly CrfSection[] = [
  {
    id: "demographics",
    number: 1,
    title: "Hasta Demografik ve Temel Klinik Bilgileri",
    shortTitle: "Bölüm 1",
    entryRole: "public",
    fields: [
      {
        id: "nationalId",
        label: "Hasta TC Kimlik No:",
        inputMode: "numeric",
        kind: "text",
        required: false,
      },
      {
        id: "protocolDate",
        label: "Tarih:",
        kind: "date",
        required: false,
        printTemplate: "____/____/202___",
      },
      {
        id: "sex",
        label: "Cinsiyet:",
        kind: "radio",
        required: false,
        options: ["Kadın", "Erkek"],
        hint: "(*Kadın cinsiyette pik plazma konsantrasyonu önemlidir)",
      },
      {
        id: "age",
        label: "Yaş:",
        kind: "number",
        required: false,
      },
      {
        id: "weight",
        label: "Vücut Ağırlığı:",
        kind: "number",
        required: false,
        unit: "kg",
      },
      {
        id: "height",
        label: "Boy:",
        kind: "number",
        required: false,
        unit: "cm",
      },
      {
        id: "bmi",
        readOnly: true,
        label: "VKİ:",
        kind: "number",
        required: false,
        unit: "kg/m²",
      },
      {
        id: "indication",
        defaultValue:
          "Derin Ven Trombozu (DVT) veya Akciğer Embolisi (PE) tedavisi / önlenmesi",
        label: "Apixaban Kullanım Endikasyonu:",
        kind: "radio",
        required: false,
        options: [
          "Atriyal Fibrilasyon (AF) (İnme / sistemik emboli önlenmesi)",
          "Derin Ven Trombozu (DVT) veya Akciğer Embolisi (PE) tedavisi / önlenmesi",
          "Ortopedik cerrahi sonrası tromboz koruması",
          "Diğer:",
        ],
      },
      {
        id: "indicationOther",
        label: "",
        kind: "text",
        required: false,
        when: {
          fieldId: "indication",
          value: "Diğer:",
        },
      },
    ],
  },
  {
    id: "apixaban",
    number: 2,
    title: "Apixaban Kullanım ve Uyum Detayları",
    shortTitle: "Bölüm 2",
    entryRole: "public",
    fields: [
      {
        id: "dailyDose",
        label: "Günlük Apixaban Dozu:",
        kind: "radio",
        required: false,
        options: ["Günde 2 kez 2.5 mg", "Günde 2 kez 5 mg", "Diğer:"],
      },
      {
        id: "dailyDoseOther",
        label: "",
        kind: "text",
        required: false,
        when: {
          fieldId: "dailyDose",
          value: "Diğer:",
        },
      },
      {
        id: "treatmentDurationYears",
        group: "Ne Kadar Süredir Apixaban Kullanıyor?",
        label: "Yıl",
        kind: "number",
        min: 0,
        integer: true,
        required: false,
      },
      {
        id: "treatmentDurationMonths",
        label: "Ay",
        kind: "number",
        min: 0,
        max: 11,
        integer: true,
        required: false,
      },
      {
        id: "adherence",
        label: "İlaç Uyumu / Sadakati:",
        kind: "radio",
        required: false,
        options: [
          "Her gün zamanında",
          "Haftada 1-2 doz unutuyor",
          "Sık sık doz atlıyor",
        ],
      },
      {
        id: "lastDoseTime",
        label: "Son Apixaban Dozunu Saat Kaçta Aldınız?:",
        kind: "time",
        required: false,
        prefix: "Saat:",
        printTemplate: "[ ______ : ______ ]",
        hint: "(Kan alma ve plazma konsantrasyon düzeyi tayini için gereklidir)",
      },
    ],
  },
  {
    id: "medications",
    number: 3,
    title: "Eşzamanlı İlaç Kullanımı ve Etkileşim Taraması (CYP3A4 / P-gp)",
    shortTitle: "Bölüm 3",
    entryRole: "public",
    fields: [
      {
        id: "otherAntithrombotic",
        label: "Düzenli Başka Kan Sulandırıcı / Pıhtı Önleyici:",
        kind: "multiselect",
        required: false,
        options: ["Hayır", "Aspirin", "Klopidogrel / Tikagrelor", "Heparin"],
      },
      {
        id: "nsaid",
        label: "Ağrı Kesici / Romatizma İlacı (NSAİİ):",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "nsaidFrequency",
        label: "",
        kind: "radio",
        required: false,
        options: ["Düzenli", "Seyrek"],
        when: {
          fieldId: "nsaid",
          value: "Evet ->",
        },
      },
      {
        id: "inhibitors",
        label:
          "Güçlü/Orta CYP3A4 ve P-gp İnhibitörleri\n(Konsantrasyonu Artıranlar - Son 1 Ay):",
        kind: "multiselect",
        required: false,
        options: [
          "Amiodaron",
          "Verapamil",
          "Diltiazem",
          "Ketokonazol / Itrakonazol",
          "Klaritromisin",
          "Hiçbiri",
        ],
      },
      {
        id: "inducers",
        label:
          "Güçlü Enzim İndükleyicileri\n(Konsantrasyonu Düşürenler - Son 1 Ay):",
        kind: "multiselect",
        required: false,
        options: [
          "Rifampisin",
          "Karbamazepin",
          "Fenitoin",
          "Sarı Kantaron (St. John's Wort)",
          "Hiçbiri",
        ],
      },
    ],
  },
  {
    id: "investigations",
    number: 4,
    title:
      "Radyoloji Bulguları ve Detaylı Laboratuvar Parametreleri\n(Formu Tamamla)",
    shortTitle: "Bölüm 4",
    entryRole: "admin",
    fields: [
      {
        id: "dvtLocations",
        label: "1. Radyoloji Bulguları (DVT Seviyesi):",
        kind: "multiselect",
        required: false,
        options: [
          "İliak",
          "Femoral",
          "Popliteal",
          "Üst Ekstremite",
          "IVC",
          "SVC",
          "Juguler",
        ],
      },
      {
        id: "dvtSide",
        label: "2. DVT Tarafı:",
        kind: "multiselect",
        required: false,
        options: ["Sağ", "Sol"],
      },
      {
        id: "bun",
        label: "BUN:",
        kind: "number",
        required: false,
        unit: "mg/dL",
        group: "3. Detaylı Laboratuvar Parametreleri\n(19 Parametre Taraması):",
      },
      {
        id: "creatinine",
        label: "Kreatinin:",
        kind: "number",
        required: false,
        unit: "mg/dL",
      },
      {
        id: "egfr",
        label: "eGFR:",
        kind: "number",
        required: false,
        unit: "mL/dk",
      },
      {
        id: "calcium",
        label: "Kalsiyum:",
        kind: "number",
        required: false,
        unit: "mg/dL",
      },
      {
        id: "sodium",
        label: "Sodyum:",
        kind: "number",
        required: false,
        unit: "mEq/L",
      },
      {
        id: "potassium",
        label: "Potasyum:",
        kind: "number",
        required: false,
        unit: "mEq/L",
      },
      {
        id: "totalBilirubin",
        label: "Total Bilirubin:",
        kind: "number",
        required: false,
        unit: "mg/dL",
      },
      {
        id: "directBilirubin",
        label: "Direk Bil.:",
        kind: "number",
        required: false,
        unit: "mg/dL",
      },
      {
        id: "ast",
        label: "AST:",
        kind: "number",
        required: false,
        unit: "U/L",
      },
      {
        id: "alt",
        label: "ALT:",
        kind: "number",
        required: false,
        unit: "U/L",
      },
      {
        id: "totalProtein",
        label: "Total Protein:",
        kind: "number",
        required: false,
        unit: "g/dL",
      },
      {
        id: "albumin",
        label: "Albumin:",
        kind: "number",
        required: false,
        unit: "g/dL",
      },
      {
        id: "wbc",
        label: "WBC:",
        kind: "number",
        required: false,
        unit: "K/uL",
      },
      {
        id: "hemoglobin",
        label: "HGB:",
        kind: "number",
        required: false,
        unit: "g/dL",
      },
      {
        id: "platelets",
        label: "PLT:",
        kind: "number",
        required: false,
        unit: "K/uL",
      },
      {
        id: "hct",
        label: "HCT:",
        kind: "number",
        required: false,
        unit: "%",
      },
      {
        id: "pt",
        label: "PT:",
        kind: "number",
        required: false,
        unit: "sn",
      },
      {
        id: "inr",
        label: "PT INR:",
        kind: "number",
        required: false,
      },
      {
        id: "aptt",
        label: "aPTT:",
        kind: "number",
        required: false,
        unit: "sn",
      },
    ],
  },
  {
    id: "bleeding-symptoms",
    number: 5,
    title: "Organ Sistemlerine Göre Kanama Belirtilerinin Taraması (ISTH)",
    shortTitle: "Bölüm 5",
    entryRole: "public",
    fields: [
      {
        id: "bruising",
        label: "1. Sebepsiz veya kolayca morarma / mor lekeler (Ekimoz)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
        group: "A. Cilt ve Yüzeyel / Mukoza Kanamaları (Minor)",
      },
      {
        id: "bruisingSize",
        label: "",
        kind: "radio",
        required: false,
        options: ["Küçük <2 cm", "Geniş >5 cm"],
        when: {
          fieldId: "bruising",
          value: "Evet ->",
        },
      },
      {
        id: "gingivalBleeding",
        label: "2. Diş fırçalarken veya kendiliğinden diş eti kanaması",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "gingivalDuration",
        label: "",
        kind: "radio",
        required: false,
        options: ["<5 dakika", ">5 dakika / Zor duruyor"],
        when: {
          fieldId: "gingivalBleeding",
          value: "Evet ->",
        },
      },
      {
        id: "epistaxis",
        label: "3. Burun kanaması (Epistaksis)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "epistaxisFrequency",
        label: "Sıklık:",
        kind: "radio",
        required: false,
        options: ["Ayda 1-2", "Haftalık"],
        when: {
          fieldId: "epistaxis",
          value: "Evet ->",
        },
      },
      {
        id: "epistaxisDuration",
        label: "Süre:",
        kind: "radio",
        required: false,
        options: ["<10 dk", ">10 dk"],
        when: {
          fieldId: "epistaxis",
          value: "Evet ->",
        },
      },
      {
        id: "cutBleeding",
        label: "4. Küçük kesiklerde veya tıraşta uzun süren kanama",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
      {
        id: "melena",
        label: "5. Dışkının katran gibi siyahlaşması (Melena)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet (Gastrointestinal kanama şüphesi)"],
        group:
          "B. Gastrointestinal Sistem Kanamaları\n(GİS - Major / CRNMB Şüphesi)",
      },
      {
        id: "hematochezia",
        label: "6. Dışkıda veya tuvalette taze kırmızı kan (Hematokezya)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
      {
        id: "hematemesis",
        label:
          "7. Kusma ile kan veya kahve telvesi benzeri parçacıklar (Hematemez)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
      {
        id: "hematuria",
        label: "8. İdrarda pembe, kırmızı veya çay rengi değişme (Hematüri)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
        group: "C. Urogenital Sistem Kanamaları",
      },
      {
        id: "menorrhagia",
        label: "9. (Kadın Hastalar) Adet kanamasında aşırı artış (Menoraji)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet", "Menopozda / Uygulanamaz"],
      },
      {
        id: "headache",
        label: "10. Aniden başlayan en şiddetli baş ağrısı",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet (Acil intrakraniyal kanama şüphesi)"],
        group:
          "D. Santral Sinir Sistemi / Nörolojik Belirtiler\n(Major Kanama Şüphesi)",
      },
      {
        id: "neurologicalSymptoms",
        label: "11. Ani baş dönmesi, görme/konuşma güçlüğü veya uyuşma",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
      {
        id: "hemarthrosis",
        label: "12. Darbe almadan eklemde ani şişlik ve ağrı (Hemartroz)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
        group: "E. Kas, Eklem ve Derin Doku Kanamaları",
      },
      {
        id: "hemoptysis",
        label: "13. Öksürükle kan veya kanlı balgam gelmesi (Hemoptizi)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
      {
        id: "subconjunctivalBleeding",
        label: "14. Göz içinde kan oturması (Subkonjonktival kanama)",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet"],
      },
    ],
  },
  {
    id: "severity",
    number: 6,
    title: "Kanama Şiddeti ve Klinik Sonuçlarının Derecelendirilmesi",
    shortTitle: "Bölüm 6",
    entryRole: "public",
    fields: [
      {
        id: "healthcareVisit",
        label: "1. Sağlık Kuruluşuna Başvuru:",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "healthcareVisitType",
        label: "",
        kind: "radio",
        required: false,
        options: ["Poliklinik", "Acil", "Yatış"],
        when: {
          fieldId: "healthcareVisit",
          value: "Evet ->",
        },
      },
      {
        id: "transfusion",
        label: "2. Kan Transfüzyonu:",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "transfusionUnits",
        label: "Miktar:",
        kind: "number",
        required: false,
        unit: "ünite",
        when: {
          fieldId: "transfusion",
          value: "Evet ->",
        },
      },
      {
        id: "treatmentInterruption",
        label: "3. Apixaban Tedavisine Ara Verilmesi / Kesilmesi:",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet ->"],
      },
      {
        id: "interruptionDays",
        label: "Ara Süresi:",
        kind: "number",
        required: false,
        unit: "gün",
        when: {
          fieldId: "treatmentInterruption",
          value: "Evet ->",
        },
      },
      {
        id: "hemoglobinDrop",
        label: "4. Hemoglobin Düşüşü (>2 g/dL):",
        kind: "radio",
        required: false,
        options: ["Hayır", "Evet", "Bilinmiyor"],
      },
    ],
  },
  {
    id: "researcher",
    number: 7,
    title: "Zamansal İlişki ve Araştırmacı Hekim Onay Alanı",
    shortTitle: "Bölüm 7",
    entryRole: "public",
    fields: [
      {
        id: "bleedingOnsetInterval",
        label:
          "1. İlk Kanama Belirtisi Apixaban Başlandıktan Ne Kadar Süre Sonra Çıktı?:",
        kind: "textarea",
        required: false,
        prefix: "Cevap:",
      },
      {
        id: "bleedingDayDose",
        label: "2. Kanama Günü Doz Durumu:",
        kind: "radio",
        required: false,
        options: [
          "Zamanında tam doz aldım",
          "Çift doz almıştım",
          "İlaçtan hemen sonra kanadı",
          "Kanama olmadı / Uygulanamaz",
        ],
      },
      {
        id: "researchNotes",
        label: "Araştırmacı Hekim Notu / Klinik Gözlem:",
        kind: "textarea",
        required: false,
      },
      {
        id: "investigatorName",
        label: "Değerlendiren Araştırmacı Hekim:",
        kind: "select",
        options: [
          "Dr. Mehmet",
          "Dr. Yasin",
          "Dr. Tuncay",
          "Dr. Burak",
          "Dr. Adnan",
          "Dr. Rabia",
        ],
        required: false,
      },
    ],
  },
];

export function createEmptyCrf(): CrfDraftValues {
  const values: Partial<CrfDraftValues> = {
    bmi: null,
    treatmentDurationTotalMonths: null,
  };
  for (const section of crfSections)
    for (const field of section.fields) {
      if (field.kind === "multiselect") values[field.id] = [];
      else if (field.id !== "bmi") values[field.id] = "";
    }
  return values as CrfDraftValues;
}

export function createNewCrf(now = new Date()): CrfDraftValues {
  const values = createEmptyCrf();
  values.protocolDate = getLocalCalendarDate(now);
  values.indication = crfSections[0]!.fields.find(
    (field) => field.id === "indication",
  )!.defaultValue!;
  return recalculateDerived(values);
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

export function isFieldVisible(
  field: CrfSection["fields"][number],
  values: CrfDraftValues,
): boolean {
  if (!field.when) return true;
  const answer = values[field.when.fieldId];
  return Array.isArray(answer)
    ? answer.includes(field.when.value)
    : answer === field.when.value;
}
export function getFieldAccessibleLabel(
  field: CrfSection["fields"][number],
): string {
  if (field.label) return field.label;
  const parent = crfSections
    .flatMap((section) => section.fields)
    .find((item) => item.id === field.when?.fieldId);
  return `${parent?.label ?? ""} ${field.when?.value ?? ""}`.trim();
}
