import { useEffect, useRef } from "react";
import type { CrfField } from "../../types/crf";
import { crfSections, formCopy, getFieldAccessibleLabel } from "./sections";

function PrintField({ field }: { field: CrfField }) {
  return (
    <div
      className={`print-field${field.when ? " paper-option-details" : ""}`}
      data-print-field={field.id}
    >
      {field.label && (
        <p className="print-field-label clinical-copy">{field.label}</p>
      )}
      {field.prefix && <p className="field-prefix">{field.prefix}</p>}
      {field.kind === "radio" || field.kind === "multiselect" ? (
        <div className="print-options">
          {field.options.map((option) => (
            <span key={option}>
              <span className="paper-checkbox" aria-hidden="true" />
              {option}
            </span>
          ))}
        </div>
      ) : (
        <div className="paper-value">
          <div
            className={`paper-answer${field.kind === "textarea" ? " paper-notes" : ""}`}
            aria-label={getFieldAccessibleLabel(field)}
          >
            {field.printTemplate}
          </div>
          {field.unit && <span>{field.unit}</span>}
        </div>
      )}
      {field.hint && (
        <p className="print-field-hint clinical-copy">{field.hint}</p>
      )}
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
            {formCopy.title}
          </h1>
          <p className="clinical-copy">{formCopy.subtitle}</p>
          <p className="print-warning">
            <strong>{formCopy.warning}</strong>
          </p>
        </header>
        {crfSections.map((section) => (
          <section
            className="print-section"
            key={section.id}
            data-print-section={section.number}
            aria-labelledby={`print-section-${section.id}`}
          >
            <h2 id={`print-section-${section.id}`} className="clinical-copy">
              BÖLÜM {section.number}: {section.title}
            </h2>
            {section.fields.map((field) => (
              <div key={field.id} className="print-field-block">
                {field.group && (
                  <h3 className="print-group-heading clinical-copy">
                    {field.group}
                  </h3>
                )}
                <PrintField field={field} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
