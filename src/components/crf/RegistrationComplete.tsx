import { useEffect, useRef, useState } from "react";

export function RegistrationComplete({
  code,
  printReady = true,
  notice,
  onAcknowledged,
  onPrint,
  onClose,
}: {
  code: string;
  printReady?: boolean;
  notice?: string;
  onAcknowledged: () => void;
  onPrint: () => void;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyState, setCopyState] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!acknowledged && !dialogRef.current?.open)
      dialogRef.current?.showModal();
  }, [acknowledged]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("Kod kopyalandı.");
    } catch {
      setCopyState("Kopyalanamadı. Kodu elle kaydedebilirsiniz.");
    }
  }
  return (
    <section className="registration-complete" aria-labelledby="saved-title">
      <h2 id="saved-title" ref={titleRef} tabIndex={-1}>
        Kayıt tamamlandı
      </h2>
      {acknowledged && (
        <>
          <p>
            Hasta Kodu: <strong className="saved-code">{code}</strong>
          </p>
          <div className="completion-actions">
            {printReady && (
              <button
                className="button primary"
                type="button"
                onClick={onPrint}
              >
                Formu Yazdır
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={onClose}
            >
              Formu Kapat
            </button>
          </div>
        </>
      )}
      {notice && <p role="alert">{notice}</p>}
      {!acknowledged && (
        <dialog
          ref={dialogRef}
          className="code-dialog"
          aria-labelledby="code-title"
          aria-describedby="code-instruction"
          onCancel={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault();
              buttons.at(-1)?.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === buttons.at(-1)
            ) {
              event.preventDefault();
              buttons[0]?.focus();
            }
          }}
        >
          <div className="code-dialog-content">
            <h2 id="code-title">KAYIT BAŞARIYLA TAMAMLANDI</h2>
            <p className="assigned-code-label">HASTAYA ATANAN KOD</p>
            <p className="assigned-code">{code}</p>
            <p id="code-instruction">
              Bu kod hastanın çalışma kodudur.
              <br />
              Hastaya ait mor (EDTA) tüpü bu kodla etiketleyin. Kodu tüpün
              üzerine okunaklı şekilde yazın veya aynı koda ait hazır barkodu
              tüpe yapıştırın.
              <br />
              İşlemi tamamlamadan önce tüp üzerindeki kodun ekranda görünen
              hasta koduyla aynı olduğundan mutlaka emin olun.
            </p>
            <p role="status">{copyState}</p>
            <div className="completion-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => void copy()}
              >
                Kodu Kopyala
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => {
                  onAcknowledged();
                  setAcknowledged(true);
                  window.requestAnimationFrame(() => titleRef.current?.focus());
                }}
              >
                Kodu Kaydettim
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
