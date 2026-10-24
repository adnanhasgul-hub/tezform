import { Fragment, useMemo, useState } from "react";
import type {
  CrfValue,
  InvestigationFieldId,
  InvestigationValues,
} from "../types/crf";
import {
  getEditableSections,
} from "./crf/sections";
import { FormField } from "./crf/FormField";
import {
  completeAdminSubject,
  type AdminSubjectSummary,
} from "../services/adminRecords";

interface Props {
  subject: AdminSubjectSummary;
  onBack: () => void;
  onCompleted: () => Promise<void> | void;
}

type InvestigationDraft = Record<
  InvestigationFieldId,
  string | string[]
>;

const investigationSection = getEditableSections("admin-completion")[0]!;

function createInvestigationDraft(
  initial: Partial<InvestigationValues>,
): InvestigationDraft {
  const values: Partial<InvestigationDraft> = {};
  for (const field of investigationSection.fields) {
    const id = field.id as InvestigationFieldId;
    const current = initial[id];
    if (field.kind === "multiselect") {
      values[id] = Array.isArray(current)
        ? current.filter((item) => field.options.includes(item))
        : [];
    } else {
      values[id] = typeof current === "string" ? current : "";
    }
  }
  return values as InvestigationDraft;
}

export function AdminInvestigationForm({
  subject,
  onBack,
  onCompleted,
}: Props) {
  const readOnly = subject.status === "completed";
  const [values, setValues] = useState<InvestigationDraft>(() =>
    createInvestigationDraft(subject.investigations),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const completedValues = useMemo(
    () => values as InvestigationValues,
    [values],
  );

  function updateField(id: InvestigationFieldId, value: CrfValue) {
    setValues((previous) => ({
      ...previous,
      [id]: Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value
          : "",
    }));
    setError("");
  }

  async function complete() {
    if (busy || readOnly) return;
    const confirmed = window.confirm(
      `${subject.subjectCode} için Bölüm 4 kaydedilecek ve kayıt “Tamamlandı” durumuna alınacak. Devam edilsin mi?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await completeAdminSubject(subject.id, completedValues);
      setSaved(true);
      await onCompleted();
    } catch {
      setError(
        "Bölüm 4 kaydedilemedi. Yönetici yetkisini ve bağlantıyı kontrol edip tekrar deneyin.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-completion" aria-labelledby="admin-completion-title">
      <div className="admin-completion-heading">
        <div>
          <p className="eyebrow">{subject.subjectCode} · BÖLÜM 4</p>
          <h2 id="admin-completion-title">{investigationSection.title}</h2>
        </div>
        <span className={`admin-status admin-status-${subject.status}`}>
          {readOnly ? "Tamamlandı" : "Tamamlanmayı Bekliyor"}
        </span>
      </div>

      <p className="admin-completion-note">
        {readOnly
          ? "Bu kayıt tamamlanmıştır. Bölüm 4 değerleri salt okunur olarak gösteriliyor."
          : "Radyoloji ve laboratuvar değerlerini girin. Alanlar kaynak forma uygun olarak isteğe bağlıdır; Kaydı Tamamla işlemi sonrasında bu ekran salt okunur olur."}
      </p>

      <form
        onSubmit={(event) => event.preventDefault()}
        autoComplete="off"
        noValidate
      >
        <fieldset disabled={readOnly || busy} aria-label="Bölüm 4 alanları">
          <div className="field-grid section-grid-4 admin-investigation-grid">
            {investigationSection.fields.map((field) => {
              const id = field.id as InvestigationFieldId;
              return (
                <Fragment key={field.id}>
                  {field.group && (
                    <h3 className="clinical-group-heading full-width">
                      {field.group}
                    </h3>
                  )}
                  <div className="question-block">
                    <div className="question-card">
                      <FormField
                        field={field}
                        value={values[id]}
                        onBlur={() => undefined}
                        onChange={(value) => updateField(id, value)}
                      />
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p className="save-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="admin-success" role="status">
            Bölüm 4 kaydedildi. {subject.subjectCode} kaydı tamamlandı.
          </p>
        )}

        <div className="admin-completion-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onBack}
          >
            ← Hasta Listesine Dön
          </button>
          {!readOnly && !saved && (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void complete()}
            >
              {busy ? "Kaydediliyor…" : "Bölüm 4'ü Kaydet ve Kaydı Tamamla"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
