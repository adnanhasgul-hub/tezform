import { Fragment, useEffect, useRef, useState } from "react";
import type { CrfValue, CrfDraftValues, FieldId } from "../../types/crf";
import {
  registerSubject,
  RegistrationConnectionError,
} from "../../services/registration";
import type { RegistrationResult } from "../../services/registrationCore";
import { createSubmissionController } from "../../services/submissionState";
import { RegistrationComplete } from "./RegistrationComplete";
import { BloodNotice } from "./BloodNotice";
import { FormField } from "./FormField";
import {
  createNewCrf,
  investigationsNotice,
  isFieldVisible,
  publicSections,
} from "./sections";
import { describeTreatmentDuration, recalculateDerived } from "./calculations";
import { validatePublicCrf, validateSection } from "./validation";

interface Props {
  onAttemptStarted?: () => void;
  onRegistered: (snapshot: CrfDraftValues, result: RegistrationResult) => void;
  onAcknowledged: () => void;
  onPrint: () => void;
  onClose: () => void;
  save?: typeof registerSubject;
}
export function CrfForm({
  onRegistered,
  onAttemptStarted,
  onAcknowledged,
  onPrint,
  onClose,
  save = registerSubject,
}: Props) {
  const [values, setValues] = useState<CrfDraftValues>(createNewCrf);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  const [touched, setTouched] = useState<ReadonlySet<FieldId>>(() => new Set());
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [locked, setLocked] = useState(false);
  const [codeAcknowledged, setCodeAcknowledged] = useState(false);
  const [printReady, setPrintReady] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const submittingRef = useRef(false);
  const [controller] = useState(() => createSubmissionController(save));
  const [focusRequest, setFocusRequest] = useState<{ fieldId: FieldId } | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const active = publicSections[activeIndex]!;
  const isLast = activeIndex === publicSections.length - 1;
  const errors = validatePublicCrf(values);

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
    if (!locked || (result && codeAcknowledged)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locked, result, codeAcknowledged]);

  function navigate(index: number, fieldId?: FieldId) {
    setVisited((previous) => new Set(previous).add(active.id));
    setActiveIndex(index);
    setFocusRequest(fieldId ? { fieldId } : null);
  }
  function updateField(id: FieldId, value: CrfValue) {
    setValues((previous) => recalculateDerived({ ...previous, [id]: value }));
    setSaveError("");
  }
  function next() {
    const invalid = active.fields.find((field) => errors[field.id]);
    if (invalid) {
      setAttempted((previous) => new Set(previous).add(active.id));
      navigate(activeIndex, invalid.id);
    } else navigate(activeIndex + 1);
  }
  async function validateAll() {
    if (submittingRef.current || result) return;
    setShowAllErrors(true);
    for (const [index, section] of publicSections.entries()) {
      const invalid = section.fields.find((field) => errors[field.id]);
      if (invalid) {
        setSaveError("");
        navigate(index, invalid.id);
        return;
      }
    }
    onAttemptStarted?.();
    submittingRef.current = true;
    setBusy(true);
    setLocked(true);
    setSaveError("");
    let saved: RegistrationResult | undefined;
    try {
      saved = await controller.submit(values);
    } catch (error) {
      setSaveError(
        error instanceof RegistrationConnectionError
          ? "Kayıt sistemiyle bağlantı kurulamadı. Lütfen tekrar deneyin."
          : "Kayıt oluşturulamadı. Lütfen tekrar deneyin.",
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
    if (saved) {
      setResult(saved);
      try {
        onRegistered(controller.snapshot!, saved);
        setPrintReady(true);
      } catch {
        setSaveError("Kayıt tamamlandı; yazdırma görünümü hazırlanamadı.");
      }
    }
  }
  function renderField(field: (typeof active.fields)[number]) {
    return (
      <FormField
        field={field}
        value={values[field.id]}
        error={
          showAllErrors || attempted.has(active.id) || touched.has(field.id)
            ? errors[field.id]
            : undefined
        }
        onBlur={() => setTouched((previous) => new Set(previous).add(field.id))}
        onChange={(value) => updateField(field.id, value)}
      />
    );
  }
  const durationDescription = describeTreatmentDuration(
    values.treatmentDurationYears,
    values.treatmentDurationMonths,
  );
  if (result)
    return (
      <RegistrationComplete
        code={result.subjectCode}
        printReady={printReady}
        notice={saveError}
        onAcknowledged={() => {
          setCodeAcknowledged(true);
          onAcknowledged();
        }}
        onPrint={onPrint}
        onClose={onClose}
      />
    );
  return (
    <section className="crf-container" aria-labelledby="crf-title">
      <div className="form-intro">
        <div>
          <p className="eyebrow">VERİ TOPLAMA FORMU</p>
          <h2 id="crf-title">Olgu rapor formu</h2>
        </div>
        <span className="step-counter">
          Adım {activeIndex + 1} / {publicSections.length}
        </span>
      </div>
      <details className="workflow-notes">
        <summary>Form hakkında</summary>
        <p>
          Cevaplar Formu Kaydet işlemi başarılı olana kadar yalnızca sayfa
          belleğinde tutulur. Sayfayı yenilemeyin. Otomatik bölüm geçişi
          kapalıdır; boş cevaplar bir seçenek olarak yorumlanmaz.
        </p>
        <p>
          <strong>Bölüm 4:</strong> {investigationsNotice}
        </p>
      </details>
      <div className="wizard-toolbar">
        <BloodNotice />
        <nav aria-label="Form bölümleri" className="stepper">
          <ol>
            {publicSections.map((section, index) => {
              const hasErrors =
                Object.keys(validateSection(section, values)).length > 0 &&
                (showAllErrors || attempted.has(section.id));
              const status = hasErrors
                ? "Biçim hatası"
                : visited.has(section.id)
                  ? "Ziyaret edildi"
                  : "Henüz görüntülenmedi";
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`step-button${hasErrors ? " has-errors" : ""}`}
                    aria-label={`Bölüm ${section.number}: ${section.title}. ${index === activeIndex ? "Aktif. " : ""}${status}`}
                    aria-current={index === activeIndex ? "step" : undefined}
                    onClick={() => navigate(index)}
                  >
                    <span className="step-number">{section.number}</span>
                    <span className="step-copy">
                      <strong>{section.shortTitle}</strong>
                      <small>{index === activeIndex ? "Aktif" : status}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <form
        ref={formRef}
        autoComplete="off"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (isLast) void validateAll();
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
            <h3
              className="clinical-copy"
              id="active-section-title"
              ref={headingRef}
              tabIndex={-1}
            >
              {active.title}
            </h3>
          </div>
          <fieldset disabled={locked} aria-label="CRF cevapları">
            <div className={`field-grid section-grid-${active.number}`}>
              {active.fields
                .filter(
                  (field) =>
                    !field.when && field.id !== "treatmentDurationMonths",
                )
                .map((field) => {
                  if (field.id === "treatmentDurationYears") {
                    const monthsField = active.fields.find(
                      (item) => item.id === "treatmentDurationMonths",
                    )!;
                    return (
                      <div
                        key={field.id}
                        className="question-card duration-card"
                      >
                        <h4 className="clinical-group-heading">
                          {field.group}
                        </h4>
                        <div className="duration-inputs">
                          {renderField(field)}
                          {renderField(monthsField)}
                        </div>
                        <output
                          className="duration-result"
                          aria-live="polite"
                          aria-label="Tedavi süresi sonucu"
                        >
                          <strong>{durationDescription || "—"}</strong>
                          {values.treatmentDurationTotalMonths !== null && (
                            <span>
                              Toplam {values.treatmentDurationTotalMonths} ay
                            </span>
                          )}
                        </output>
                      </div>
                    );
                  }
                  const children = active.fields.filter(
                    (item) =>
                      item.when?.fieldId === field.id &&
                      isFieldVisible(item, values),
                  );
                  const wide =
                    (field.kind === "radio" || field.kind === "multiselect") &&
                    field.options.some((option) => option.length > 60);
                  return (
                    <Fragment key={field.id}>
                      {field.group && (
                        <h4 className="clinical-group-heading full-width">
                          {field.group}
                        </h4>
                      )}
                      <div
                        className={`question-block${wide ? " full-width" : ""}`}
                      >
                        <div className="question-card">
                          {renderField(field)}
                          {children.length > 0 && (
                            <div className="conditional-details">
                              {children.map((child) => (
                                <div key={child.id}>{renderField(child)}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
            </div>
          </fieldset>
        </section>
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
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Kaydediliyor..." : "Formu Kaydet"}
            </button>
          ) : (
            <button className="button primary" type="button" onClick={next}>
              Sonraki Bölüm →
            </button>
          )}
        </div>
        <p role="status">{busy ? "Kaydediliyor..." : ""}</p>
        {saveError && (
          <p className="save-error" role="alert">
            {saveError}
          </p>
        )}
        {locked && !busy && (
          <p className="form-end">
            Kayıt denemesinde gönderilen cevaplar korunuyor. Tekrar denemek aynı
            kayıt isteğini kullanır.
          </p>
        )}
      </form>
    </section>
  );
}
