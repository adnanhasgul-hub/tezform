import { createAdminRecordDraft } from "../services/adminModel";
import { AdminDeleteDialog } from "../components/AdminDeleteDialog";
import { AdminRowActions } from "../components/AdminRowActions";
import { ResearchDataCenter } from "../components/ResearchDataCenter";
import { ResearchExports } from "../components/ResearchExports";
import { SpssDictionary } from "../components/SpssDictionary";
import {
  investigationState,
  investigationLabels,
} from "../services/adminModel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminInvestigationForm } from "../components/AdminInvestigationForm";
import { AdminSubjectDetail } from "../components/AdminSubjectDetail";
import { PrintCrf } from "../components/crf/PrintCrf";
import {
  AdminLoginError,
  loginAdmin,
  logoutAdmin,
  observeAdminSession,
  type AdminSession,
} from "../services/auth";
import {
  listAdminSubjects,
  type AdminSubjectSummary,
} from "../services/adminRecords";
import { adminUsernameAlias } from "../services/authPolicy";

type StatusFilter = "all" | "empty" | "partial" | "complete";
type RecordMode =
  | "view"
  | "complete"
  | "edit"
  | "full-edit"
  | "print"
  | "delete";

interface RecordSelection {
  id: string;
  mode: RecordMode;
}

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: Date | null) {
  return value ? dateFormatter.format(value) : "—";
}

export function AdminPage() {
  const [session, setSession] = useState<AdminSession>({ status: "checking" });
  const [username, setUsername] = useState(adminUsernameAlias);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [subjects, setSubjects] = useState<AdminSubjectSummary[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectsError, setSubjectsError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const [researchCenterOpen, setResearchCenterOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);

  const refreshSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    setSubjectsError("");
    try {
      setSubjects(await listAdminSubjects());
    } catch {
      setSubjectsError(
        "Hasta kayıtları yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.",
      );
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  useEffect(
    () =>
      observeAdminSession((next) => {
        setSession(next);
        if (next.status === "authorized") void refreshSubjects();
        else {
          setSubjects([]);
          setSelection(null);
          setResearchCenterOpen(false);
          setDictionaryOpen(false);
        }
      }),
    [refreshSubjects],
  );

  const selectedSubject = useMemo(
    () =>
      selection
        ? (subjects.find((subject) => subject.id === selection.id) ?? null)
        : null,
    [selection, subjects],
  );

  const counts = useMemo(
    () => ({
      total: subjects.length,
      empty: subjects.filter(
        (subject) => investigationState(subject.investigations) === "empty",
      ).length,
      partial: subjects.filter(
        (subject) => investigationState(subject.investigations) === "partial",
      ).length,
      completed: subjects.filter(
        (subject) => investigationState(subject.investigations) === "complete",
      ).length,
    }),
    [subjects],
  );

  const filteredSubjects = useMemo(() => {
    const needle = search.trim().toLocaleUpperCase("tr-TR");
    return subjects.filter((subject) => {
      const matchesStatus =
        statusFilter === "all" ||
        investigationState(subject.investigations) === statusFilter;
      const matchesSearch =
        !needle ||
        subject.subjectCode.toLocaleUpperCase("tr-TR").includes(needle) ||
        (subject.publicValues.investigatorName || "")
          .toLocaleUpperCase("tr-TR")
          .includes(needle) ||
        (/^\d+$/.test(needle) &&
          String(subject.subjectNumber).includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, subjects]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const submittedPassword = password;
    setPassword("");
    try {
      await loginAdmin(username, submittedPassword);
    } catch (error) {
      setMessage(
        error instanceof AdminLoginError && error.reason === "unauthorized"
          ? "Bu hesap yönetici yetkisine sahip değil."
          : error instanceof AdminLoginError && error.reason === "unavailable"
            ? "Yönetici sistemiyle bağlantı kurulamadı. Lütfen tekrar deneyin."
            : "Kullanıcı adı veya şifre hatalı.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await logoutAdmin();
    } catch {
      setMessage("Oturum kapatılamadı. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleInvestigationSaved(subjectId: string) {
    await refreshSubjects();
    setSelection({ id: subjectId, mode: "view" });
  }

  if (session.status === "authorized") {
    const closeRecord = () => setSelection(null);

    return (
      <div className="app-shell admin-shell">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">TEZFORM · YÖNETİCİ ALANI</p>
            <h1>Yönetici Paneli</h1>
          </div>
          <div className="admin-topbar-actions">
            <button
              type="button"
              className="button secondary"
              aria-current={researchCenterOpen ? "page" : undefined}
              onClick={() => {
                setSelection(null);
                setDictionaryOpen(false);
                setResearchCenterOpen((previous) => !previous);
              }}
            >
              {researchCenterOpen
                ? "Yönetici Paneli"
                : "Araştırma Veri Merkezi"}
            </button>
            {researchCenterOpen && !dictionaryOpen && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setSelection(null);
                  setDictionaryOpen(true);
                }}
              >
                SPSS Veri Sözlüğü
              </button>
            )}
            <a className="button secondary" href="/">
              Forma Dön
            </a>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void logout()}
            >
              Çıkış Yap
            </button>
          </div>
        </header>

        <main className="admin-dashboard">
          {researchCenterOpen && (
            <div hidden={Boolean(selection) || dictionaryOpen}>
              <ResearchDataCenter
                subjects={subjects}
                loading={loadingSubjects}
                error={subjectsError}
                onRefresh={() => void refreshSubjects()}
                onBack={() => {
                  setSelection(null);
                  setResearchCenterOpen(false);
                }}
                onView={(id) => setSelection({ id, mode: "view" })}
                renderExports={(records, scope) => (
                  <ResearchExports records={records} scope={scope} />
                )}
              />
            </div>
          )}
          {dictionaryOpen ? (
            <SpssDictionary onBack={() => setDictionaryOpen(false)} />
          ) : selection && selectedSubject ? (
            selection.mode === "delete" ? (
              <AdminDeleteDialog
                subject={selectedSubject}
                onClose={closeRecord}
                onDeleted={async () => {
                  await refreshSubjects();
                  closeRecord();
                }}
              />
            ) : selection.mode === "print" ? (
              <PrintCrf
                preview
                values={createAdminRecordDraft(selectedSubject)}
                subjectCode={selectedSubject.subjectCode}
                closeLabel="Hasta Listesine Dön"
                onClose={closeRecord}
              />
            ) : selection.mode === "view" ? (
              <AdminSubjectDetail
                key={selectedSubject.id}
                subject={selectedSubject}
                onBack={closeRecord}
              />
            ) : (
              <AdminInvestigationForm
                key={`${selectedSubject.id}-${selection.mode}`}
                subject={selectedSubject}
                fullEdit={selection.mode === "full-edit"}
                onBack={closeRecord}
                onCompleted={() => handleInvestigationSaved(selectedSubject.id)}
              />
            )
          ) : researchCenterOpen ? null : (
            <>
              <section className="admin-stats" aria-label="Kayıt özeti">
                <article className="admin-stat-card admin-stat-total">
                  <span>Toplam Hasta</span>
                  <strong>{counts.total}</strong>
                </article>
                <article className="admin-stat-card admin-stat-empty">
                  <span>Boş</span>
                  <strong>{counts.empty}</strong>
                </article>
                <article className="admin-stat-card admin-stat-partial">
                  <span>Devam Et</span>
                  <strong>{counts.partial}</strong>
                </article>
                <article className="admin-stat-card admin-stat-complete">
                  <span>Tamamlandı</span>
                  <strong>{counts.completed}</strong>
                </article>
              </section>

              <section
                className="admin-records"
                aria-labelledby="records-title"
              >
                <div className="admin-records-heading">
                  <div>
                    <p className="eyebrow">ARAŞTIRMA KAYITLARI</p>
                    <h2 id="records-title">Hasta Kayıtları</h2>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={loadingSubjects}
                    onClick={() => void refreshSubjects()}
                  >
                    {loadingSubjects ? "Yükleniyor…" : "Listeyi Yenile"}
                  </button>
                </div>

                <div className="admin-filters">
                  <label>
                    <span>Hasta kodu veya hekim ile ara</span>
                    <input
                      type="search"
                      placeholder="Örn. AHT-001 veya 001"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Durum</span>
                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as StatusFilter)
                      }
                    >
                      <option value="all">Tümü</option>
                      <option value="empty">Boş</option>
                      <option value="partial">Devam Et</option>
                      <option value="complete">Tamamlandı</option>
                    </select>
                  </label>
                </div>

                {subjectsError && (
                  <p className="field-error" role="alert">
                    {subjectsError}
                  </p>
                )}

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Hasta Kodu</th>
                        <th scope="col">Kayıt Tarihi</th>
                        <th scope="col">Hekim</th>
                        <th scope="col">Durum</th>
                        <th scope="col">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubjects.map((subject) => (
                        <tr key={subject.id}>
                          <td>
                            <strong className="admin-subject-code">
                              {subject.subjectCode}
                            </strong>
                          </td>
                          <td>{formatDate(subject.createdAt)}</td>
                          <td>
                            {subject.publicValues.investigatorName?.trim() ||
                              "—"}
                          </td>
                          <td>
                            <span
                              className={`admin-status admin-status-${investigationState(subject.investigations)}`}
                            >
                              {
                                investigationLabels[
                                  investigationState(subject.investigations)
                                ]
                              }
                            </span>
                          </td>
                          <td>
                            <AdminRowActions
                              subjectCode={subject.subjectCode}
                              state={investigationState(subject.investigations)}
                              onAction={(mode) =>
                                setSelection({ id: subject.id, mode })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      {!loadingSubjects && filteredSubjects.length === 0 && (
                        <tr>
                          <td className="admin-empty" colSpan={5}>
                            {subjects.length === 0
                              ? "Henüz hasta kaydı bulunmuyor."
                              : "Arama ve filtreye uygun kayıt bulunamadı."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="admin-list-note">
                  Bölüm 4 durumu kayıtlı değerlerden hesaplanır. “Tüm Formu
                  Düzenle” mevcut kaydı günceller; yeni hasta kodu oluşturmaz.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="admin-page" style={{ maxWidth: 480, padding: "32px 0" }}>
        <a href="/">← Forma Dön</a>
        <section
          className="eligibility-card"
          aria-labelledby="admin-page-title"
        >
          <p className="eyebrow">TEZFORM · YÖNETİCİ ALANI</p>
          <h1 id="admin-page-title" style={{ fontSize: 28 }}>
            Yönetici Girişi
          </h1>
          {session.status === "checking" ? (
            <p role="status">Yetki kontrol ediliyor…</p>
          ) : (
            <>
              {session.status === "unauthorized" && (
                <p className="field-error" role="alert">
                  Bu hesap yönetici yetkisine sahip değil.
                </p>
              )}
              {session.status === "unavailable" && (
                <p className="field-error" role="alert">
                  Yönetici yetkisi doğrulanamadı. Lütfen tekrar deneyin.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  void submit(event);
                }}
                autoComplete="on"
              >
                <div className="form-field" style={{ marginBottom: 16 }}>
                  <label htmlFor="admin-username">Kullanıcı Adı</label>
                  <input
                    id="admin-username"
                    name="username"
                    autoComplete="username"
                    value={username}
                    disabled={busy}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="form-field" style={{ marginBottom: 20 }}>
                  <label htmlFor="admin-password">Şifre</label>
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy}
                >
                  {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
                </button>
              </form>
              {session.status === "unauthorized" && (
                <button
                  type="button"
                  className="button secondary"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  Çıkış Yap
                </button>
              )}
            </>
          )}
          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
