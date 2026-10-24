import { getTreatmentDuration } from "./calculations";
import { useEffect, useRef } from "react";
import type { CrfField, CrfDraftValues } from "../../types/crf";
import { crfSections, formCopy, getFieldAccessibleLabel } from "./sections";

const FORM_TITLE =
  "Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Veri Toplama Formu";

function PrintField({
  field,
  values,
}: {
  field: CrfField;
  values?: CrfDraftValues;
}) {
  const answer = values?.[field.id];
  const text =
    typeof answer === "number"
      ? answer.toFixed(1)
      : typeof answer === "string"
        ? answer
        : "";
  return (
    <div
      className={`print-field${field.when ? " paper-option-details" : ""}`}
      data-print-field={field.id}
    >
      {field.label && (
        <p className="print-field-label clinical-copy">{field.label}</p>
      )}
      {field.prefix && <p className="field-prefix">{field.prefix}</p>}
      {field.kind === "radio" ||
      field.kind === "multiselect" ||
      field.kind === "select" ? (
        <div className="print-options">
          {field.options.map((option) => (
            <span key={option}>
              <span className="paper-checkbox" aria-hidden="true">
                {(
                  Array.isArray(answer)
                    ? answer.includes(option)
                    : answer === option
                )
                  ? "✓"
                  : ""}
              </span>
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
            {values ? text : field.printTemplate}
          </div>
          {field.unit && <span>{field.unit}</span>}
        </div>
      )}
      {values &&
        field.id === "treatmentDurationMonths" &&
        (() => {
          const duration = getTreatmentDuration(
            values.treatmentDurationYears,
            values.treatmentDurationMonths,
          );
          return duration ? (
            <p className="print-field-hint">
              {duration.years} yıl {duration.months} ay ({duration.totalMonths}{" "}
              ay)
            </p>
          ) : null;
        })()}
      {field.hint && (
        <p className="print-field-hint clinical-copy">{field.hint}</p>
      )}
    </div>
  );
}
export function PrintCrf({
  preview,
  onClose,
  values,
  subjectCode,
  blocked = false,
  closeLabel = "Forma Dön",
}: {
  preview: boolean;
  onClose: () => void;
  values?: CrfDraftValues;
  subjectCode?: string;
  blocked?: boolean;
  closeLabel?: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [preview]);
  if (blocked) return null;
  return (
    <section
      className={`print-view${preview ? " is-preview" : ""}`}
      aria-label={
        values ? "Yazdırılabilir kayıtlı CRF" : "Yazdırılabilir boş CRF"
      }
    >
      <div className="print-toolbar">
        <p>A4 · Bölüm 4 dahil tüm bölümler</p>
        <div>
          <button className="button secondary" type="button" onClick={onClose}>
            {closeLabel}
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
            {FORM_TITLE}
          </h1>
          <p className="print-warning">
            <strong>{formCopy.warning}</strong>
          </p>
          <p className="print-subject-code">
            <strong>Hasta Kodu: {subjectCode ?? "__________________"}</strong>
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
                <PrintField field={field} values={values} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
