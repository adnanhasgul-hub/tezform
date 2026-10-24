import { useMemo, useState, type ReactNode } from "react";
import type { AdminSubjectSummary } from "../services/adminRecords";
import {
  investigationLabels,
  investigationState,
} from "../services/adminModel";
import { crfSections } from "./crf/sections";
import {
  emptyRecordFilters,
  filterResearchSubjects,
  researchSummary,
  validDateRange,
  type RecordFilters,
} from "../services/researchData";
import "./research-center.css";

export type ExportScope = "filtered" | "all";

interface Props {
  subjects: readonly AdminSubjectSummary[];
  onBack: () => void;
  onView?: (id: string) => void;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  renderExports?: (
    records: readonly AdminSubjectSummary[],
    scope: ExportScope,
  ) => ReactNode;
}

const dates = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
});
const dateLabel = (value: Date | null) =>
  value && Number.isFinite(value.getTime()) ? dates.format(value) : "—";

/** Mounted only inside the existing authorized admin session. */
export function ResearchDataCenter({
  subjects,
  onBack,
  onView,
  loading = false,
  error = "",
  onRefresh,
  renderExports,
}: Props) {
  const [filters, setFilters] = useState<RecordFilters>({
    ...emptyRecordFilters,
  });
  const [scope, setScope] = useState<ExportScope>("filtered");
  const summary = useMemo(() => researchSummary(subjects), [subjects]);
  const filtered = useMemo(
    () => filterResearchSubjects(subjects, filters),
    [subjects, filters],
  );
  const physicians = useMemo(() => {
    const field = crfSections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "investigatorName");
    const options = field?.kind === "select" ? field.options : [];
    return [
      ...new Set([
        ...options,
        ...subjects.map(
          (record) => record.publicValues.investigatorName?.trim() || "",
        ),
      ]),
    ]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "tr-TR"));
  }, [subjects]);
  const rangeValid = validDateRange(filters);
  const exportRecords = scope === "all" ? subjects : filtered;
  function update<K extends keyof RecordFilters>(
    key: K,
    value: RecordFilters[K],
  ) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <section
      className="research-center"
      aria-labelledby="research-center-title"
    >
      <div className="research-center-heading">
        <div>
          <p className="eyebrow">TEZFORM · ARAŞTIRMA OPERASYONLARI</p>
          <h2 id="research-center-title">Araştırma Veri Merkezi</h2>
          <p>Veri toplama sürecinin kayıt ve tamamlama özeti.</p>
        </div>
        <div className="admin-action-group">
          {onRefresh && (
            <button
              type="button"
              className="button secondary"
              disabled={loading}
              onClick={onRefresh}
            >
              {loading ? "Yükleniyor…" : "Listeyi Yenile"}
            </button>
          )}
          <button type="button" className="button secondary" onClick={onBack}>
            Yönetici Paneline Dön
          </button>
        </div>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <section className="admin-stats" aria-label="Araştırma kayıt özeti">
        {(
          [
            ["total", "Toplam kayıt"],
            ["empty", "Boş"],
            ["partial", "Devam Et"],
            ["complete", "Tamamlandı"],
          ] as const
        ).map(([key, label]) => (
          <article key={key} className={`admin-stat-card admin-stat-${key}`}>
            <span>{label}</span>
            <strong>{summary[key]}</strong>
          </article>
        ))}
      </section>

      <div className="research-overview">
        <section
          className="research-card"
          aria-labelledby="physician-summary-title"
        >
          <h3 id="physician-summary-title">Hekimlere göre kayıt sayısı</h3>
          {summary.physicians.length ? (
            <dl className="research-physician-counts">
              {summary.physicians.map((item) => (
                <div key={item.name}>
                  <dt>{item.name}</dt>
                  <dd>{item.count}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Henüz kayıt bulunmuyor.</p>
          )}
        </section>
        <section
          className="research-card"
          aria-labelledby="recent-records-title"
        >
          <h3 id="recent-records-title">Son eklenen kayıtlar</h3>
          {summary.recent.length ? (
            <ol className="research-recent">
              {summary.recent.map((record) => (
                <li key={record.id}>
                  <span>
                    <strong>{record.subjectCode}</strong>
                    <small>{dateLabel(record.createdAt)}</small>
                  </span>
                  {onView && (
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`${record.subjectCode} kaydını görüntüle`}
                      onClick={() => onView(record.id)}
                    >
                      Görüntüle
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>Tarihi bilinen kayıt bulunmuyor.</p>
          )}
        </section>
      </div>

      <section
        className="research-card"
        aria-labelledby="research-records-title"
      >
        <h3 id="research-records-title">Araştırma kayıtları</h3>
        <div className="research-filters">
          <label>
            AHT kodu
            <input
              type="search"
              value={filters.code}
              onChange={(event) => update("code", event.target.value)}
              placeholder="Örn. AHT-005"
            />
          </label>
          <label>
            Hekim
            <select
              aria-label="Hekim"
              value={filters.physician}
              onChange={(event) => update("physician", event.target.value)}
            >
              <option value="">Tüm hekimler</option>
              {physicians.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Durum
            <select
              aria-label="Durum"
              value={filters.status}
              onChange={(event) =>
                update("status", event.target.value as RecordFilters["status"])
              }
            >
              <option value="all">Tümü</option>
              <option value="empty">Boş</option>
              <option value="partial">Devam Et</option>
              <option value="complete">Tamamlandı</option>
            </select>
          </label>
          <label>
            Başlangıç tarihi
            <input
              type="date"
              value={filters.fromDate}
              aria-invalid={!rangeValid || undefined}
              aria-describedby={
                !rangeValid
                  ? "research-date-error research-date-help"
                  : "research-date-help"
              }
              onChange={(event) => update("fromDate", event.target.value)}
            />
          </label>
          <label>
            Bitiş tarihi
            <input
              type="date"
              value={filters.toDate}
              aria-invalid={!rangeValid || undefined}
              aria-describedby={
                !rangeValid
                  ? "research-date-error research-date-help"
                  : "research-date-help"
              }
              onChange={(event) => update("toDate", event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => setFilters({ ...emptyRecordFilters })}
          >
            Filtreleri Temizle
          </button>
        </div>
        <p id="research-date-help" className="research-note">
          Tarih filtreleri kayıt oluşturulma tarihine göre, cihazınızın yerel
          takvim günleriyle uygulanır. Başlangıç ve bitiş günleri dahildir.
        </p>
        {!rangeValid && (
          <p id="research-date-error" className="field-error" role="alert">
            Başlangıç ve bitiş tarihlerini kontrol edin. Başlangıç tarihi bitiş
            tarihinden sonra olamaz.
          </p>
        )}
        <p className="research-filter-count" role="status">
          Filtrelenmiş {filtered.length} / toplam {subjects.length} kayıt
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table research-table">
            <thead>
              <tr>
                <th scope="col">Hasta Kodu</th>
                <th scope="col">Kayıt Tarihi</th>
                <th scope="col">Hekim</th>
                <th scope="col">Durum</th>
                {onView && <th scope="col">İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const status = investigationState(record.investigations);
                return (
                  <tr key={record.id}>
                    <td>
                      <strong className="admin-subject-code">
                        {record.subjectCode}
                      </strong>
                    </td>
                    <td>{dateLabel(record.createdAt)}</td>
                    <td>
                      {record.publicValues.investigatorName?.trim() || "—"}
                    </td>
                    <td>
                      <span className={`admin-status admin-status-${status}`}>
                        {investigationLabels[status]}
                      </span>
                    </td>
                    {onView && (
                      <td>
                        <button
                          type="button"
                          className="button secondary admin-action-button"
                          onClick={() => onView(record.id)}
                        >
                          Görüntüle
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={onView ? 5 : 4} className="admin-empty">
                    {loading
                      ? "Kayıtlar yükleniyor…"
                      : "Filtrelere uygun kayıt bulunamadı."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <fieldset
          className="research-export-scope"
          disabled={!rangeValid || loading || Boolean(error)}
        >
          <legend>Dışa aktarım kapsamı</legend>
          <div className="research-scope-options">
            <label>
              <input
                type="radio"
                name="research-export-scope"
                value="filtered"
                checked={scope === "filtered"}
                onChange={() => setScope("filtered")}
              />
              Filtrelenmiş kayıtları dışa aktar
            </label>
            <label>
              <input
                type="radio"
                name="research-export-scope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              Tüm kayıtları dışa aktar
            </label>
          </div>
          <p>Seçilen kapsam: {exportRecords.length} kayıt</p>
          {renderExports?.(exportRecords, scope)}
        </fieldset>
      </section>
    </section>
  );
}
