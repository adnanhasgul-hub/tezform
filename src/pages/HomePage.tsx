import { useEffect, useRef, useState } from "react";
import { ensureAnonymousUser } from "../services/auth";
import type { CrfDraftValues } from "../types/crf";
import type { RegistrationResult } from "../services/registrationCore";
import { PrintCrf } from "../components/crf/PrintCrf";
import { formCopy } from "../components/crf/sections";
import { BloodNotice } from "../components/crf/BloodNotice";
import { CrfForm } from "../components/crf/CrfForm";
import type { EligibilityAnswer } from "../types/crf";

export function HomePage() {
  const [eligibility, setEligibility] = useState<EligibilityAnswer>("");
  const [formOpen, setFormOpen] = useState(false);
  const [saved, setSaved] = useState<{
    values: CrfDraftValues;
    result: RegistrationResult;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [attemptStarted, setAttemptStarted] = useState(false);
  useEffect(() => {
    void ensureAnonymousUser().catch(() => {
      /* Save displays a safe connection error. */
    });
  }, []);
  const [printOpen, setPrintOpen] = useState(false);
  const printButtonRef = useRef<HTMLButtonElement>(null);

  function changeEligibility(answer: EligibilityAnswer) {
    setEligibility(answer);
    setFormOpen(false);
  }

  return (
    <>
      <div
        className={`app-shell${formOpen ? " form-active" : ""}`}
        hidden={printOpen}
      >
        <header className="topbar">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            {formCopy.title} <small>KLİNİK ARAŞTIRMA</small>
          </span>
          <div className="topbar-actions">
            {!formOpen && (
              <button
                ref={printButtonRef}
                type="button"
                className="button secondary"
                onClick={() => setPrintOpen(true)}
              >
                Form Yazdır
              </button>
            )}
            {!formOpen && (
              <a href="/admin" className="button secondary admin-button">
                Yönetici Paneli
              </a>
            )}
          </div>
        </header>
        <main>
          <section className="intro" aria-labelledby="page-title">
            <p className="eyebrow">ELEKTRONİK OLGU RAPOR FORMU</p>
            <h1 id="page-title">{formCopy.title}</h1>
            <p className="subtitle clinical-copy">{formCopy.subtitle}</p>
          </section>
          {!formOpen && <BloodNotice />}
          {!saved && !attemptStarted && (
            <details className="eligibility-review" open={!formOpen}>
              <summary>Uygunluk kontrolü</summary>
              <section
                className="eligibility-card"
                aria-labelledby="eligibility-title"
              >
                <p className="eyebrow">BAŞLAMADAN ÖNCE · UYGUNLUK KONTROLÜ</p>
                <fieldset>
                  <legend id="eligibility-title">
                    Hasta eş zamanlı antiagregan kullanıyor mu?
                  </legend>
                  <div className="eligibility-options">
                    <label
                      className={`choice${eligibility === "yes" ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="antiaggregant"
                        value="yes"
                        checked={eligibility === "yes"}
                        onChange={() => changeEligibility("yes")}
                        aria-describedby="eligibility-note"
                      />
                      Evet
                    </label>
                    <label
                      className={`choice${eligibility === "no" ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="antiaggregant"
                        value="no"
                        checked={eligibility === "no"}
                        onChange={() => changeEligibility("no")}
                        aria-describedby="eligibility-note"
                      />
                      Hayır
                    </label>
                  </div>
                </fieldset>
                <div aria-live="polite" aria-atomic="true">
                  {eligibility === "yes" && (
                    <p className="ineligible-message">
                      Hasta çalışma için uygun değil.
                    </p>
                  )}
                  {eligibility === "no" && (
                    <p className="eligible-message">
                      Formu açarak arayüzü inceleyebilirsiniz.
                    </p>
                  )}
                </div>
                <div className="eligibility-actions">
                  <button
                    className="button primary"
                    type="button"
                    disabled={eligibility !== "no"}
                    aria-expanded={formOpen}
                    onClick={() => setFormOpen(true)}
                  >
                    Formu Doldur <span aria-hidden="true">→</span>
                  </button>
                  <p id="eligibility-note">
                    {eligibility
                      ? "Uygunluk yanıtını değiştirmek açık formu kapatır ve alanları temizler."
                      : "Devam etmek için uygunluk sorusunu yanıtlayın."}
                  </p>
                </div>
              </section>
            </details>
          )}
          {formOpen && eligibility === "no" && (
            <CrfForm
              onAttemptStarted={() => setAttemptStarted(true)}
              onRegistered={(values, result) => setSaved({ values, result })}
              onAcknowledged={() => setAcknowledged(true)}
              onPrint={() => {
                if (saved && acknowledged) window.print();
              }}
              onClose={() => {
                setSaved(null);
                setAcknowledged(false);
                setAttemptStarted(false);
                setFormOpen(false);
                setEligibility("");
                window.scrollTo(0, 0);
              }}
            />
          )}
          <p className="privacy-note">
            Formu Kaydet başarılı olduğunda cevaplar araştırma kaydı olarak
            saklanır. Sayfa yenilendiğinde açık form ve yazdırma oturumu geri
            getirilemez.
          </p>
        </main>
        <footer>
          Dr. Adnan Hasgül · Tez Araştırması{" "}
          <span>eCRF / Form arayüzü taslağı</span>
        </footer>
      </div>
      <PrintCrf
        preview={printOpen}
        blocked={saved !== null && !acknowledged}
        values={saved && acknowledged ? saved.values : undefined}
        subjectCode={
          saved && acknowledged ? saved.result.subjectCode : undefined
        }
        onClose={() => {
          setPrintOpen(false);
          window.requestAnimationFrame(() => printButtonRef.current?.focus());
        }}
      />
    </>
  );
}
