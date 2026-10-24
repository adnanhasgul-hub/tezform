import { Fragment, useState } from "react";
import type { CrfValue, FieldId } from "../types/crf";
import { crfSections, getFieldForDisplay } from "./crf/sections";
import { FormField } from "./crf/FormField";
import { recalculateDerived } from "./crf/calculations";
import { validateSection } from "./crf/validation";
import {
  saveAdminSubject,
  type AdminSubjectSummary,
} from "../services/adminRecords";
import {
  createAdminRecordDraft,
  investigationValues,
  investigationState,
  investigationLabels,
} from "../services/adminModel";
import {
  ambiguousLegacyLocations,
  clearInactiveDvt,
  legacyDvtMessage,
  resolvedDvt,
} from "../services/dvtModel";
interface Props {
  subject: AdminSubjectSummary;
  onBack: () => void;
  onCompleted: () => Promise<void> | void;
  fullEdit?: boolean;
  saveRecord?: typeof saveAdminSubject;
}
export function AdminInvestigationForm({
  subject,
  onBack,
  onCompleted,
  fullEdit = false,
  saveRecord = saveAdminSubject,
}: Props) {
  const [values, setValues] = useState(() => createAdminRecordDraft(subject));
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const legacyLocations = ambiguousLegacyLocations(subject.investigations);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldId, string>>>({});
  const [error, setError] = useState("");
  const sections = fullEdit
    ? crfSections
    : crfSections.filter((section) => section.entryRole === "admin");
  const state = legacyLocations.length && (!legacyConfirmed || !resolvedDvt(values))
    ? "partial"
    : investigationState(investigationValues(values));
  function update(id: FieldId, value: CrfValue) {
    if (
      id === "dvtSide" ||
      id === "dvtRightLocations" ||
      id === "dvtLeftLocations"
    )
      setLegacyConfirmed(false);
    setValues((previous) =>
      clearInactiveDvt(recalculateDerived({ ...previous, [id]: value })),
    );
    setErrors((previous) => ({ ...previous, [id]: undefined }));
    setError("");
  }
  async function save(exit = false) {
    if (busy) return;
    if (legacyLocations.length && (!legacyConfirmed || !resolvedDvt(values))) {
      setError(
        "Eski ortak lokalizasyonları inceleyip seçili tarafların lokalizasyonlarını ayrı ayrı doğrulayınız.",
      );
      return;
    }
    const invalid = Object.assign(
      {},
      ...sections.map((section) => validateSection(section, values)),
    );
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setError("İşaretli alanları kontrol edin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveRecord(subject.id, values, fullEdit);
      await onCompleted();
      if (exit) onBack();
    } catch {
      setError(
        "Form kaydedilemedi. Yetkiyi ve bağlantıyı kontrol edip tekrar deneyin.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-completion">
      <div className="admin-completion-heading">
        <h2>
          {subject.subjectCode} ·{" "}
          {fullEdit ? "Tüm Formu Düzenle" : "Bölüm 4 Düzenle"}
        </h2>
        <span className={`admin-status admin-status-${state}`}>
          {investigationLabels[state]}
        </span>
      </div>
      {!fullEdit && (
        <p>
          Kısmen doldurduğunuz Bölüm 4 değerlerini kaydedip daha sonra devam
          edebilirsiniz.
        </p>
      )}
      {legacyLocations.length > 0 && (
        <div className="save-error" role="alert">
          <p>{legacyDvtMessage(subject.investigations.dvtSide ?? [])}</p>
          <p>Eski ortak lokalizasyonlar: {legacyLocations.join(", ")}</p>
          <label>
            <input
              type="checkbox"
              checked={legacyConfirmed}
              disabled={busy}
              onChange={(event) => setLegacyConfirmed(event.target.checked)}
            />
            Sağ ve Sol lokalizasyonlarını ayrı ayrı doğruladım.
          </label>
        </div>
      )}
      <form
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          {sections.map((section) => (
            <section key={section.id} className="admin-detail-section">
              <h3>{section.title}</h3>
              <div className="field-grid">
                {section.fields.flatMap((source) => {
                  const field = getFieldForDisplay(source, values);
                  return !field
                    ? []
                    : [
                        <Fragment key={field.id}>
                          {field.group && (
                            <h4 className="clinical-group-heading full-width">
                              {field.group}
                            </h4>
                          )}
                          <div className="question-card">
                            <FormField
                              field={field}
                              value={values[field.id]}
                              error={errors[field.id]}
                              onBlur={() => undefined}
                              onChange={(value) => update(field.id, value)}
                            />
                          </div>
                        </Fragment>,
                      ];
                })}
              </div>
            </section>
          ))}
        </fieldset>
        {error && (
          <p className="save-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-completion-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => (fullEdit ? onBack() : void save(true))}
          >
            {fullEdit ? "← Hasta Listesine Dön" : "Kaydet ve Listeye Dön"}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Formu Kaydet"}
          </button>
        </div>
      </form>
    </section>
  );
}
