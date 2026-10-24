import { useEffect, useRef, useState } from "react";
import type { AdminSubjectSummary } from "../services/adminRecords";
import { deleteAdminSubject } from "../services/adminRecords";
interface Props {
  subject: AdminSubjectSummary;
  onClose: () => void;
  onDeleted: () => Promise<void>;
  remove?: typeof deleteAdminSubject;
}
export function AdminDeleteDialog({
  subject,
  onClose,
  onDeleted,
  remove = deleteAdminSubject,
}: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || confirmation !== subject.subjectCode || !password)
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const submitted = password;
    setPassword("");
    try {
      await remove(subject.id, submitted);
      await onDeleted();
    } catch {
      setError(
        "Silme işlemi tamamlanamadı. Şifrenizi, yetkinizi ve bağlantıyı kontrol edin.",
      );
    } finally {
      setPassword("");
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          setPassword("");
          onClose();
        }
      }}
      aria-labelledby="delete-title"
      className="eligibility-card admin-delete-dialog"
    >
      <h2 id="delete-title">{subject.subjectCode} kaydını sil</h2>
      <p role="alert">
        Bu işlem geri alınamaz. Kayıtlı tüm hasta verileri silinecek.{" "}
        {subject.subjectCode} kodu başka bir hastaya verilmeyecektir.
      </p>
      <form onSubmit={(event) => void submit(event)} autoComplete="off">
        <fieldset disabled={busy}>
          <label>
            Onay için {subject.subjectCode} yazın
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <label>
            Yönetici şifresi
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="admin-action-group">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setPassword("");
                onClose();
              }}
            >
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={confirmation !== subject.subjectCode || !password}
            >
              {busy ? "Siliniyor…" : "Kalıcı Olarak Sil"}
            </button>
          </div>
        </fieldset>
      </form>
    </dialog>
  );
}
