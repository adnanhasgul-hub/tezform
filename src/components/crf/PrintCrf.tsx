import { useEffect, useRef } from "react";
import type { CrfField } from "../../types/crf";
import { crfSections } from "./sections";

function PrintField({ field }: { field: CrfField }) {
  return (
    <div className="print-field" data-print-field={field.id}>
      <p className="print-field-label">{field.label}</p>
      {field.kind === "select" || field.kind === "multiselect" ? (
        <div className="print-options">
          {field.options.map((option) => (
            <span key={option}>
              <span className="paper-checkbox" aria-hidden="true" />
              {option}
            </span>
          ))}
        </div>
      ) : (
        <div
          className={`paper-answer${field.kind === "textarea" ? " paper-notes" : ""}`}
          aria-label="Elle doldurma alanı"
        />
      )}
      {field.hint && <p className="print-field-hint">{field.hint}</p>}
    </div>
  );
}

export function PrintCrf({
  preview,
  onClose,
}: {
  preview: boolean;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [preview]);
  return (
    <section
      className={`print-view${preview ? " is-preview" : ""}`}
      aria-label="Yazdırılabilir boş CRF"
    >
      <div className="print-toolbar">
        <p>A4 · Boş manuel form · Bölüm 4 dahil tüm bölümler</p>
        <div>
          <button className="button secondary" type="button" onClick={onClose}>
            Forma Dön
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => window.print()}
          >
            Yazdır
          </button>
        </div>
      </div>
      <div className="print-sheet">
        <header className="print-header">
          <h1 ref={titleRef} tabIndex={-1}>
            Dr. Adnan Hasgül Tez Formu
          </h1>
          <p>
            Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Veri Toplama
            Formu (CRF)
          </p>
          <p className="print-warning">
            <strong>MOR TÜP (EDTA) · Mor tüpte kan alınacak!</strong>
          </p>
          <p>Boş manuel CRF taslağı · Kimlik belirleyici bilgi yazmayın.</p>
        </header>
        <div className="print-field print-eligibility">
          <p className="print-field-label">
            Hasta eş zamanlı antiagregan kullanıyor mu?
          </p>
          <div className="print-options">
            <span>
              <span className="paper-checkbox" aria-hidden="true" />
              Evet → Hasta çalışma için uygun değil.
            </span>
            <span>
              <span className="paper-checkbox" aria-hidden="true" />
              Hayır
            </span>
          </div>
        </div>
        {crfSections.map((section) => (
          <section
            className="print-section"
            key={section.id}
            data-print-section={section.number}
            aria-labelledby={`print-section-${section.id}`}
          >
            <h2 id={`print-section-${section.id}`}>
              {section.number}. {section.title}
            </h2>
            <p className="print-section-description">{section.description}</p>
            {section.fields.map((field, index) => (
              <div key={field.id} className="print-field-block">
                {field.group &&
                  field.group !== section.fields[index - 1]?.group && (
                    <h3 className="print-group-heading">{field.group}</h3>
                  )}
                <PrintField field={field} />
              </div>
            ))}
          </section>
        ))}
        <p className="print-footnote">
          Bu taslak otomatik skor veya klinik karar üretmez. Elektronik kayıt
          oluşturmaz.
        </p>
      </div>
    </section>
  );
}
