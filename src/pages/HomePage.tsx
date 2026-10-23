import { StatusCard } from "../components/StatusCard";
import { initializationFailed, isFirebaseConfigured } from "../firebase/client";
import type { SystemStatus } from "../types/status";

export function HomePage() {
  const firebaseReady = isFirebaseConfigured && !initializationFailed;
  const statuses: SystemStatus[] = [
    { label: "Web Uygulaması", value: "Hazır" },
    {
      label: "Firebase",
      value: initializationFailed
        ? "Yapılandırma hatası"
        : firebaseReady
          ? "Yapılandırıldı"
          : "Yapılandırılacak",
      pending: !firebaseReady,
    },
    { label: "Firestore", value: "Hazır" },
    { label: "Authentication", value: "Hazır" },
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand-mark" aria-hidden="true">
          +
        </span>
        <span>
          TEZFORM <small>KLİNİK ARAŞTIRMA</small>
        </span>
        <span className="phase">Altyapı aşaması</span>
      </header>
      <main>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">ELEKTRONİK OLGU RAPOR FORMU</p>
          <h1 id="page-title">Dr. Adnan Hasgül Tez Formu</h1>
          <p className="subtitle">
            Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Sistemi
          </p>
        </section>
        <section className="blood-notice" aria-labelledby="blood-title">
          <span className="tube" aria-hidden="true">
            !
          </span>
          <p className="notice-label">ÖRNEK ALIM HATIRLATMASI</p>
          <h2 id="blood-title">MOR TÜPTE (EDTA) KAN ALINACAK!</h2>
        </section>
        <section className="system" aria-labelledby="system-title">
          <div className="system-heading">
            <span className="check" aria-hidden="true">
              ✓
            </span>
            <h2 id="system-title">Altyapı başarıyla çalışıyor.</h2>
          </div>
          <dl className="status-grid">
            {statuses.map((status) => (
              <StatusCard key={status.label} {...status} />
            ))}
          </dl>
          <p className="status-note">
            Servis göstergeleri entegrasyon hazırlığını belirtir; bağlantı,
            yetkilendirme veya güvenlik kuralı doğrulaması değildir.
          </p>
        </section>
        <p className="privacy-note">
          Bu sürüm yalnızca altyapı doğrulaması içindir. Hasta verisi girişi ve
          klinik kayıt işlemleri henüz etkin değildir.
        </p>
      </main>
      <footer>
        Dr. Adnan Hasgül · Tez Araştırması{" "}
        <span>eCRF / Geliştirme altyapısı</span>
      </footer>
    </div>
  );
}
