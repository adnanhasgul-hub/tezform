import { formCopy } from "./sections";

export function BloodNotice() {
  return (
    <section className="blood-notice" aria-label="Klinik uyarı">
      <span className="tube" aria-hidden="true">
        !
      </span>
      <h2>{formCopy.warning}</h2>
    </section>
  );
}
