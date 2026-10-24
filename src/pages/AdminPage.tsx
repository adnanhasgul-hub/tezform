import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminInvestigationForm } from "../components/AdminInvestigationForm";
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

type StatusFilter = "all" | "pending_completion" | "completed";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: Date | null) {
  return value ? dateFormatter.format(value) : "—";
}

function statusLabel(status: AdminSubjectSummary["status"]) {
  return status === "completed" ? "Tamamlandı" : "Tamamlanmayı Bekliyor";
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
  const [selectedSubject, setSelectedSubject] =
    useState<AdminSubjectSummary | null>(null);

  useEffect(() => observeAdminSession(setSession), []);

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

  useEffect(() => {
    if (session.status === "authorized") void refreshSubjects();
    else {
      setSubjects([]);
      setSelectedSubject(null);
    }
  }, [session.status, refreshSubjects]);

  const counts = useMemo(
    () => ({
      total: subjects.length,
      pending: subjects.filter(
        (subject) => subject.status === "pending_completion",
      ).length,
      completed: subjects.filter((subject) => subject.status === "completed")
        .length,
    }),
    [subjects],
  );

  const filteredSubjects = useMemo(() => {
    const needle = search.trim().toLocaleUpperCase("tr-TR");
    return subjects.filter((subject) => {
      const matchesStatus =
        statusFilter === "all" || subject.status === statusFilter;
      const matchesSearch =
        !needle ||
        subject.subjectCode.toLocaleUpperCase("tr-TR").includes(needle) ||
        String(subject.subjectNumber).includes(needle.replace(/\D/g, ""));
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
      // Auth state observer performs the same UID membership guard for the dashboard.
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

  if (session.status === "authorized") {
    return (
      <div className="app-shell admin-shell">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">TEZFORM · YÖNETİCİ ALANI</p>
            <h1>Yönetici Paneli</h1>
          </div>
          <div className="admin-topbar-actions">
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
          {selectedSubject ? (
            <AdminInvestigationForm
              key={selectedSubject.id}
              subject={selectedSubject}
              onBack={() => setSelectedSubject(null)}
              onCompleted={refreshSubjects}
            />
          ) : (
            <>
              <section className="admin-stats" aria-label="Kayıt özeti">
                <article className="admin-stat-card">
                  <span>Toplam Hasta</span>
                  <strong>{counts.total}</strong>
                </article>
                <article className="admin-stat-card">
                  <span>Tamamlanmayı Bekleyen</span>
                  <strong>{counts.pending}</strong>
                </article>
                <article className="admin-stat-card">
                  <span>Tamamlanan</span>
                  <strong>{counts.completed}</strong>
                </article>
              </section>

              <section className="admin-records" aria-labelledby="records-title">
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
                    <span>Hasta kodu ile ara</span>
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
                      <option value="pending_completion">
                        Tamamlanmayı Bekleyen
                      </option>
                      <option value="completed">Tamamlanan</option>
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
                            <span
                              className={`admin-status admin-status-${subject.status}`}
                            >
                              {statusLabel(subject.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button secondary admin-action-button"
                              onClick={() => setSelectedSubject(subject)}
                            >
                              {subject.status === "completed"
                                ? "Görüntüle"
                                : "Formu Tamamla"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!loadingSubjects && filteredSubjects.length === 0 && (
                        <tr>
                          <td className="admin-empty" colSpan={4}>
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
                  “Formu Tamamla” yalnızca Bölüm 4 radyoloji ve laboratuvar
                  alanlarını kaydeder. Hasta tarafından girilen Bölüm 1, 2, 3,
                  5, 6 ve 7 verileri bu işlemde değiştirilmez.
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
