import {
  createAdminRecordDraft,
  investigationState,
  investigationLabels,
} from "../services/adminModel";
import { useMemo, useState } from "react";
import type { CrfDraftValues, CrfField } from "../types/crf";
import type { AdminSubjectSummary } from "../services/adminRecords";
import { PrintCrf } from "./crf/PrintCrf";
import {
  crfSections,
  getFieldAccessibleLabel,
  isFieldVisible,
} from "./crf/sections";

interface Props {
  subject: AdminSubjectSummary;
  onBack: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "—";
}

function formatAnswer(field: CrfField, values: CrfDraftValues): string {
  const answer = values[field.id];
  if (Array.isArray(answer)) return answer.length ? answer.join(", ") : "—";
  if (typeof answer === "number") return answer.toFixed(1);
  if (typeof answer !== "string" || !answer.trim()) return "—";
  if (field.kind === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(answer);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  }
  return answer;
}

export function AdminSubjectDetail({ subject, onBack }: Props) {
  const [printPreview, setPrintPreview] = useState(false);
  const values = useMemo(() => createAdminRecordDraft(subject), [subject]);

  if (printPreview) {
    return (
      <PrintCrf
        preview
        values={values}
        subjectCode={subject.subjectCode}
        closeLabel="Kayda Dön"
        onClose={() => setPrintPreview(false)}
      />
    );
  }

  return (
    <section className="admin-detail" aria-labelledby="admin-detail-title">
      <div className="admin-detail-heading">
        <div>
          <p className="eyebrow">{subject.subjectCode} · TAM KAYIT</p>
          <h2 id="admin-detail-title">Hasta CRF Ayrıntıları</h2>
        </div>
        <span
          className={`admin-status admin-status-${investigationState(subject.investigations)}`}
        >
          {investigationLabels[investigationState(subject.investigations)]}
        </span>
      </div>

      <div className="admin-detail-meta" aria-label="Kayıt bilgileri">
        <div>
          <span>Hasta Kodu</span>
          <strong>{subject.subjectCode}</strong>
        </div>
        <div>
          <span>Kayıt Tarihi</span>
          <strong>{formatDateTime(subject.createdAt)}</strong>
        </div>
        <div>
          <span>Son Güncelleme</span>
          <strong>{formatDateTime(subject.updatedAt)}</strong>
        </div>
      </div>

      <p className="admin-detail-note">
        Bu görünüm kayıtlı CRF verilerinin salt okunur özetidir. Bölüm 1, 2, 3,
        5, 6 ve 7 hasta formundan; Bölüm 4 yönetici tamamlama ekranından gelir.
      </p>

      <div className="admin-detail-sections">
        {crfSections.map((section) => (
          <section
            key={section.id}
            className="admin-detail-section"
            aria-labelledby={`admin-detail-section-${section.id}`}
          >
            <div className="admin-detail-section-heading">
              <span>{String(section.number).padStart(2, "0")}</span>
              <h3 id={`admin-detail-section-${section.id}`}>{section.title}</h3>
            </div>
            <dl className="admin-detail-grid">
              {section.fields.map((field) => {
                if (field.when && !isFieldVisible(field, values)) return null;
                return (
                  <div
                    key={field.id}
                    className={`admin-detail-field${field.kind === "textarea" ? " admin-detail-field-wide" : ""}`}
                  >
                    {field.group && (
                      <dt className="admin-detail-group">{field.group}</dt>
                    )}
                    <dt>{getFieldAccessibleLabel(field)}</dt>
                    <dd>
                      {formatAnswer(field, values)}
                      {field.unit && formatAnswer(field, values) !== "—"
                        ? ` ${field.unit}`
                        : ""}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      <div className="admin-detail-actions">
        <button type="button" className="button secondary" onClick={onBack}>
          ← Hasta Listesine Dön
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => setPrintPreview(true)}
        >
          Doldurulmuş Formu Yazdır
        </button>
      </div>
    </section>
  );
}
