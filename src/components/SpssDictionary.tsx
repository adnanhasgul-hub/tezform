import { useEffect, useMemo, useRef, useState } from "react";
import {
  dictionaryDisplayHeaders,
  dictionaryDisplayRow,
  filterDictionary,
  SCHEMA_VERSION,
  spssSchema,
} from "../export/spssSchema";
import { downloadFile } from "../export/download";
import "./export-tools.css";

export function SpssDictionary({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("all");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  const variables = useMemo(
    () => filterDictionary(search, section),
    [search, section],
  );
  async function pdf() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const [{ buildDictionaryPdf }, response] = await Promise.all([
        import("../export/dictionaryPdf"),
        fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`),
      ]);
      if (!response.ok) throw new Error("Font unavailable");
      const bytes = await buildDictionaryPdf(
        new Uint8Array(await response.arrayBuffer()),
      );
      downloadFile(bytes, "tezform_spss_veri_sozlugu.pdf", "application/pdf");
    } catch {
      setError("PDF oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="admin-records spss-dictionary"
      aria-labelledby="dictionary-title"
    >
      <div className="admin-records-heading">
        <div>
          <p className="eyebrow">TEZFORM · ANALİTİK VERİ SÖZLEŞMESİ</p>
          <h2 ref={heading} tabIndex={-1} id="dictionary-title">
            SPSS Veri Sözlüğü
          </h2>
          <p>Şema Versiyonu: {SCHEMA_VERSION}</p>
        </div>
        <div className="admin-action-group">
          <button type="button" className="button secondary" onClick={onBack}>
            Veri Merkezine Dön
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void pdf()}
          >
            {busy ? "PDF Hazırlanıyor…" : "PDF Olarak İndir"}
          </button>
        </div>
      </div>
      <p className="research-note">
        PDF, arama filtresinden bağımsız tüm şemayı içerir. Sayısal missing
        değeri 0 (Hayır) değildir; her değişkenin politikası aşağıda belirtilir.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="research-filters dictionary-filters">
        <label>
          Sözlükte ara
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Değişken, Türkçe açıklama veya CRF alanı"
          />
        </label>
        <label>
          Bölüm
          <select
            aria-label="Bölüm"
            value={section}
            onChange={(event) => setSection(event.target.value)}
          >
            <option value="all">Tüm bölümler</option>
            {[1, 2, 3, 4, 5, 6, 7].map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        Filtrelenmiş {variables.length} / toplam {spssSchema.length} değişken
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table dictionary-table">
          <thead>
            <tr>
              {dictionaryDisplayHeaders.map((header) => (
                <th scope="col" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variables.map((variable) => (
              <tr key={variable.name} data-variable={variable.name}>
                {dictionaryDisplayRow(variable).map((value, index) => (
                  <td key={index}>
                    {index === 0 ? <code>{value}</code> : value || "—"}
                    {index === 2 && (
                      <details>
                        <summary>Missing / dönüşüm</summary>
                        <p>{variable.missingPolicy}</p>
                        <p>{variable.description}</p>
                      </details>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!variables.length && (
              <tr>
                <td colSpan={8}>Eşleşen değişken bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
