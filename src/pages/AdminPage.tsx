import { useEffect, useState } from "react";
import {
  AdminLoginError,
  loginAdmin,
  logoutAdmin,
  observeAdminSession,
  type AdminSession,
} from "../services/auth";
import { adminUsernameAlias } from "../services/authPolicy";

export function AdminPage() {
  const [session, setSession] = useState<AdminSession>({ status: "checking" });
  const [username, setUsername] = useState(adminUsernameAlias);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => observeAdminSession(setSession), []);

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
            {session.status === "authorized"
              ? "Yönetici Paneli"
              : "Yönetici Girişi"}
          </h1>
          {session.status === "checking" ? (
            <p role="status">Yetki kontrol ediliyor…</p>
          ) : session.status === "authorized" ? (
            <>
              <p>Hasta kayıtları sonraki aşamada burada listelenecek.</p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  void logout();
                }}
              >
                Çıkış Yap
              </button>
            </>
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
                  onClick={() => {
                    void logout();
                  }}
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
