import { useEffect, useRef, useState } from "react";
import type { CrfValue, CrfValues, FieldId } from "../../types/crf";
import { FormField } from "./FormField";
import {
  createEmptyCrf,
  investigationsNotice,
  publicSections,
} from "./sections";
import {
  getRequiredProgress,
  validatePublicCrf,
  validateSection,
} from "./validation";

export function CrfForm({ paused = false }: { paused?: boolean }) {
  const [values, setValues] = useState<CrfValues>(createEmptyCrf);
  const [activeIndex, setActiveIndex] = useState(0);
  const [edited, setEdited] = useState<ReadonlySet<string>>(() => new Set());
  const [reviewSections, setReviewSections] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [touched, setTouched] = useState<ReadonlySet<FieldId>>(() => new Set());
  const [attemptedSections, setAttemptedSections] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [validated, setValidated] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ fieldId: FieldId } | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const active = publicSections[activeIndex]!;
  const isLast = activeIndex === publicSections.length - 1;
  const errors = validatePublicCrf(values);
  const sectionValid =
    Object.keys(validateSection(active, values)).length === 0;
  const progress = getRequiredProgress(values);
  const willAdvance =
    !paused &&
    !isLast &&
    sectionValid &&
    edited.has(active.id) &&
    !reviewSections.has(active.id);

  useEffect(() => {
    const target = focusRequest
      ? formRef.current?.querySelector<HTMLElement>(
          `#crf-${focusRequest.fieldId}`,
        )
      : headingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [activeIndex, focusRequest]);

  useEffect(() => {
    if (!willAdvance) return;
    const timer = window.setTimeout(() => {
      setReviewSections((previous) => new Set(previous).add(active.id));
      setFocusRequest(null);
      setActiveIndex(activeIndex + 1);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [willAdvance, values, active.id, activeIndex]);

  function navigate(index: number, fieldId?: FieldId) {
    if (sectionValid)
      setReviewSections((previous) => new Set(previous).add(active.id));
    setActiveIndex(index);
    setFocusRequest(fieldId ? { fieldId } : null);
  }

  function updateField(id: FieldId, value: CrfValue) {
    setValues((previous) => ({ ...previous, [id]: value }));
    setEdited((previous) => new Set(previous).add(active.id));
    setValidated(false);
  }

  function next() {
    const firstInvalid = active.fields.find((field) => errors[field.id]);
    if (firstInvalid) {
      setAttemptedSections((previous) => new Set(previous).add(active.id));
      navigate(activeIndex, firstInvalid.id);
      return;
    }
    navigate(activeIndex + 1);
  }

  function validateAll() {
    setShowAllErrors(true);
    for (const [index, section] of publicSections.entries()) {
      const invalid = section.fields.find((field) => errors[field.id]);
      if (invalid) {
        setValidated(false);
        navigate(index, invalid.id);
        return;
      }
    }
    setValidated(true);
  }

  return (
    <section className="crf-container" aria-labelledby="crf-title">
      <div className="form-intro">
        <p className="eyebrow">VERİ TOPLAMA FORMU · 6 ADIM</p>
        <h2 id="crf-title">Olgu rapor formu</h2>
        <p>
          Arayüz taslağıdır. Yalnızca kurgu değerlerle deneyin. Cevaplar bölüm
          geçişlerinde korunur; sayfa yenilendiğinde silinir ve sunucuya
          gönderilmez.
        </p>
      </div>
      <p className="admin-section-notice">
        <strong>Bölüm 4:</strong> {investigationsNotice}
      </p>
      <div className="crf-progress">
        <div className="progress-caption">
          <strong>
            Adım {activeIndex + 1} / {publicSections.length}
          </strong>
          <span>
            Zorunlu alanlar: {progress.valid} / {progress.total} · %
            {progress.percent}
          </span>
        </div>
        <progress
          max={100}
          value={progress.percent}
          aria-label="Zorunlu public alanların tamamlanma oranı"
        />
      </div>
      <nav aria-label="Form bölümleri" className="stepper">
        <ol>
          {publicSections.map((section, index) => {
            const complete =
              Object.keys(validateSection(section, values)).length === 0;
            const hasErrors =
              !complete &&
              (showAllErrors ||
                attemptedSections.has(section.id) ||
                edited.has(section.id));
            const status = hasErrors
              ? "Eksik/hatalı"
              : complete
                ? "Tamamlandı"
                : "Henüz başlanmadı";
            return (
              <li key={section.id}>
                <button
                  type="button"
                  className={`step-button ${complete ? "complete" : hasErrors ? "has-errors" : ""}`}
                  aria-label={`Bölüm ${section.number}: ${section.title}. ${index === activeIndex ? "Aktif. " : ""}${status}`}
                  aria-current={index === activeIndex ? "step" : undefined}
                  onClick={() => navigate(index)}
                >
                  <span className="step-number">{section.number}</span>
                  <span className="step-copy">
                    <strong>{section.shortTitle}</strong>
                    <small>
                      {index === activeIndex ? `Aktif · ${status}` : status}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <form
        ref={formRef}
        autoComplete="off"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (isLast) validateAll();
        }}
      >
        <section
          className="form-section"
          aria-labelledby="active-section-title"
        >
          <div className="section-heading">
            <span className="section-number" aria-hidden="true">
              {String(active.number).padStart(2, "0")}
            </span>
            <div>
              <h3 id="active-section-title" ref={headingRef} tabIndex={-1}>
                {active.title}
              </h3>
              <p>{active.description}</p>
            </div>
          </div>
          <p className="required-note">
            * işaretli alanlar zorunludur. Boş cevaplar “Hayır” kabul edilmez.
          </p>
          <div className="field-grid">
            {active.fields.map((field) => (
              <FormField
                key={field.id}
                field={field}
                value={values[field.id]}
                error={
                  showAllErrors ||
                  attemptedSections.has(active.id) ||
                  touched.has(field.id)
                    ? errors[field.id]
                    : undefined
                }
                onBlur={() =>
                  setTouched((previous) => new Set(previous).add(field.id))
                }
                onChange={(value) => updateField(field.id, value)}
              />
            ))}
          </div>
        </section>
        <div className="wizard-feedback" role="status">
          {willAdvance
            ? "Bölüm tamamlandı. Sonraki bölüme geçiliyor…"
            : reviewSections.has(active.id)
              ? "Kontrol modu: düzeltmelerinizden sonra sonraki bölümü kendiniz seçin."
              : ""}
        </div>
        <div className="wizard-actions">
          <button
            className="button secondary"
            type="button"
            disabled={activeIndex === 0}
            onClick={() => navigate(activeIndex - 1)}
          >
            Önceki Bölüm
          </button>
          {isLast ? (
            <button className="button primary" type="submit">
              Kaydet
            </button>
          ) : (
            <button className="button primary" type="button" onClick={next}>
              Sonraki Bölüm →
            </button>
          )}
        </div>
        <div role="status">
          {validated && (
            <p className="validation-success">
              Zorunlu alanlar doğrulandı. Veri kaydedilmedi. Bölüm 4 yönetici
              tarafından tamamlanmayı bekliyor.
            </p>
          )}
        </div>
        <p className="form-end">
          “Kaydet” yalnızca alanları doğrular; bu sürümde kayıt oluşturmaz.
        </p>
      </form>
    </section>
  );
}
