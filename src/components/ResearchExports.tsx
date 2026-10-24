import { useRef, useState } from "react";
import type { AdminSubjectSummary } from "../services/adminRecords";
import { downloadFile } from "../export/download";
import type { RecordScope } from "../export/exportEngine";
import "./export-tools.css";

interface Props {
  records: readonly AdminSubjectSummary[];
  scope: RecordScope;
}
/** Receives the exact Phase C selection. It never queries, filters or writes records. */
export function ResearchExports({ records, scope }: Props) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function generate(kind: "excel" | "spss") {
    if (inFlight.current || !records.length) return;
    const snapshot = structuredClone(records);
    const selectedScope = scope;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const engine = await import("../export/exportEngine");
      const bytes =
        kind === "excel"
          ? await engine.buildHumanExcel(snapshot)
          : await engine.buildSpssPackage(snapshot, selectedScope);
      downloadFile(
        bytes,
        kind === "excel" ? "tezform_crf.xlsx" : "tezform_spss.zip",
        kind === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/zip",
      );
      setMessage(`${snapshot.length} kayıt için dosya hazırlandı.`);
    } catch {
      setFailed(true);
      setMessage(
        "Dosya oluşturulamadı. Veri biçimini ve metin uzunluklarını kontrol edip tekrar deneyin. Kaynak veri değiştirilmedi.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="export-tools" aria-busy={busy}>
      <div className="admin-action-group">
        <button
          type="button"
          className="button primary"
          disabled={busy || !records.length}
          onClick={() => void generate("excel")}
        >
          Excel'e Aktar
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !records.length}
          onClick={() => void generate("spss")}
        >
          SPSS İçin Dışa Aktar
        </button>
      </div>
      {busy && <p role="status">Dosya hazırlanıyor…</p>}
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "field-error" : "research-note"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
