import { useEffect, useRef } from "react";

export function AdminPlaceholder({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby="admin-title"
      aria-describedby="admin-description"
      onClose={onClose}
      onKeyDown={(event) => {
        // This placeholder has one interactive control; keep Tab focus in the modal.
        if (event.key === "Tab") {
          event.preventDefault();
          closeButtonRef.current?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="dialog-content">
        <p className="eyebrow">YÖNETİCİ ALANI</p>
        <h2 id="admin-title">Yönetici Paneli</h2>
        <p id="admin-description">
          Yönetici paneli sonraki aşamada yapılandırılacaktır.
        </p>
        <button
          ref={closeButtonRef}
          className="button primary"
          type="button"
          onClick={() => dialogRef.current?.close()}
        >
          Kapat
        </button>
      </div>
    </dialog>
  );
}
