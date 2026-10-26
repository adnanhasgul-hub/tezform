import { createAdminRecordDraft } from "../services/adminModel";
import { AdminDeleteDialog } from "../components/AdminDeleteDialog";
import type { AdminRowAction } from "../components/AdminRowActions";
import { ResearchDataCenter } from "../components/ResearchDataCenter";
import { ResearchExports } from "../components/ResearchExports";
import { SpssDictionary } from "../components/SpssDictionary";
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

interface RecordSelection {
  id: string;
  mode: AdminRowAction;
}

export function AdminPage() {
  const [session, setSession] = useState<AdminSession>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [subjects, setSubjects] = useState<AdminSubjectSummary[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectsError, setSubjectsError] = useState("");
  const [selection, setSelection] = useState<RecordSelection | null>(null);
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

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const submittedPassword = password;
    setPassword("");
    try {
      await loginAdmin(submittedPassword);
    } catch (error) {
      setMessage(
        error instanceof AdminLoginError && error.reason === "unauthorized"
          ? "Bu hesap yönetici yetkisine sahip değil."
          : error instanceof AdminLoginError && error.reason === "unavailable"
            ? "Yönetici sistemiyle bağlantı kurulamadı. Lütfen tekrar deneyin."
            : "Şifre hatalı.",
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
            <h1>Araştırma Veri Merkezi</h1>
          </div>
          <div className="admin-topbar-actions">
            {!dictionaryOpen && (
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
          <div hidden={Boolean(selection) || dictionaryOpen}>
            <ResearchDataCenter
              subjects={subjects}
              loading={loadingSubjects}
              error={subjectsError}
              onRefresh={() => void refreshSubjects()}
              onAction={(id, mode) => setSelection({ id, mode })}
              renderExports={(records, scope) => (
                <ResearchExports records={records} scope={scope} />
              )}
            />
          </div>
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
          ) : null}
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
                <div className="form-field" style={{ marginBottom: 20 }}>
                  <label htmlFor="admin-password">Şifre</label>
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
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
