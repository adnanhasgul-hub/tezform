# ADNAN TEZ FORMU

Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Veri Toplama Formu (CRF) için web eCRF arayüzü ve Firebase/deployment altyapısı. Bu sürüm uygunluk sorusu, altı adımlı dijital CRF, yedi bölümlü boş yazdırma formu ve yönetici placeholder modalı içerir. Veri kaydetme, yönetici işlevleri, giriş ve export henüz uygulanmamıştır. Gerçek hasta verisi kullanmayın.

## Geliştirme

Node.js 24 LTS ve npm kullanın (`.nvmrc`).

```sh
npm install
cp .env.example .env.local
# .env.local alanlarını Firebase Console'daki Web app yapılandırmasıyla doldurun.
npm run dev
```

Tekrarlanabilir bağımlılık kurulumu için `npm ci` kullanın. `package-lock.json` sürüm kontrolündedir. Bu bulut ortamında varsayılan npm cache dizini yazılamıyorsa komuta `--cache /workspace/.npm-cache` ekleyin.

```sh
npm run lint
npm run typecheck
npm run build
npm run preview
```

`build`, TypeScript kontrolü ve Vite production build yapar; çıktı `dist/` dizinidir. Merkezi doğrulama ve bölüm erişimi testleri Node.js 24 ile `node --test tests/*.test.ts` komutuyla çalışır (ek bağımlılık gerektirmez). Firebase SDK'nın dolaylı Node.js gRPC bağımlılığındaki güvenlik bildirimleri nedeniyle `@grpc/grpc-js` için `^1.14.6` override uygulanmıştır; lockfile bu düzeltmeyi korur. Production bağımlılık taraması: `npm audit --omit=dev`. Form arayüzü Firebase ayarları olmadan da açılır; bu aşamada Firebase servislerine bağlanmaz.

## Mimari

- `src/pages/`: `HomePage`, antiagregan uygunluk kontrolü ve form açma akışını yönetir.
- `src/components/crf/`: tek kaynak bölüm/alan metadata’sı (`sections.ts`), yerel tarih/VKİ/tedavi süresi hesapları (`calculations.ts`), merkezi doğrulama (`validation.ts`), kontrollü alan bileşeni (`FormField`), dijital stepper/state (`CrfForm`) ve boş basılı form (`PrintCrf`).
- `src/components/AdminPlaceholder.tsx`: klavye ve Escape ile kullanılabilen yerel dialog.
- `src/firebase/client.ts`: modüler Firebase SDK; App, Authentication ve Firestore başlangıcı. Eksik ayarlarda servisler `null` kalır. Tüketiciler bunu kontrol etmelidir.
- `src/types/crf.ts`: alanlar, public/admin bağlamları ve gelecekteki kayıt için strict TypeScript tipleri. `CrfRecord` modeli public cevaplarla yönetici bulgularını ayırır: `pending_completion` ilk klinik aşamanın bitip Bölüm 4’ün beklendiğini, `completed` yönetici aşamasının da tamamlandığını belirtir. Bu aşamada kayıt nesnesi oluşturulmaz veya status güncellenmez.
- `src/services/`, `src/utils/`: ilerideki servis ve yardımcılar için ayrılmıştır.

Firebase başlangıcı veri okumaz/yazmaz, oturum açmaz. Kalıcı Firestore offline cache etkinleştirilmemiştir. Hareket azaltma tercihi mor uyarının yavaş animasyonunu kapatır.

## Kaynak CRF ve form arayüzü

Klinik içerik, kullanıcı tarafından sağlanan kaynak CRF’den alınmıştır. Çalışan uygulamanın tek soru kaynağı `src/components/crf/sections.ts` dosyasıdır. Başlık, klinik uyarı, bölüm/alt kategori başlıkları, soru metinleri, parantez açıklamaları, seçenekler ve birimler bu metadata’dan dijital ve basılı formda gösterilir. Bu sürüm TC Kimlik No, yerel tarih varsayılanı, salt okunur VKİ, DVT/PE varsayılanı, yıl/ay tedavi süresi, altı hekim seçeneği ve imza/kaşe kaldırılmasını kapsayan kullanıcı onaylı revizyonları uygular. Test referansı `tests/fixtures/source-crf.txt`, boş çizgi/kutu görselleştirmeleri hariç kabul edilen kaynak klinik metnin bağımsız transkriptidir; runtime soru listesi değildir. Testler yalnızca boşluk/satır sarmasını normalize ederek klinik metni baştan sona karşılaştırır.

Önceki sürümden korunan laboratuvar istisnası: Bölüm 1’deki **Son Laboratuvar Değerleri (Varsa)** bloğu ve **Serum Kreatinin, Tahmini CrCl (Klerens), ALT / AST, Hemoglobin (Hb)** alanları dijital ve basılı formda bulunmaz. Bölüm 4 laboratuvarları eksiksiz korunur.

| Bölüm | Veri alanı sayısı |
| --- | ---: |
| 1 | 9 |
| 2 | 6 |
| 3 | 5 |
| 4 | 21 |
| 5 | 18 |
| 6 | 7 |
| 7 | 5 |
| Toplam | **71** |

Merkezi metadata 50 public ve 21 yönetici/Bölüm 4 alanı içerir. Ayrıca veri modelinde sorulardan türetilen `treatmentDurationTotalMonths` vardır; bu ek bir klinik soru değildir. Sayılar bağımsız cevap değerlerini kapsar: “Diğer” metinleri, sıklık/süre/boyut alt cevapları, transfüzyon miktarı ve ara süresi ayrı alanlardır. Uygunluk sorusu CRF’ye dahil değildir.

- Başlangıçtaki antiagregan sorusu çalışma öncesi uygulama kontrolüdür. “Evet” formu açmayı engeller; “Hayır” ile “Formu Doldur” kullanılabilir. Bu soru basılı kaynak CRF’ye eklenmez.
- Public dijital akış **1 → 2 → 3 → 5 → 6 → 7** olarak kalır. Aynı anda bir bölüm görünür. Bölüm 4 yalnızca yönetici bilgilendirmesiyle temsil edilir; kullanıcıya düzenlenebilir alanları gösterilmez.
- Kaynak zorunluluk belirtmediğinden **tüm klinik alanların `required` değeri false**. Önceki keyfi zorunluluklar ve otomatik ilerleme kaldırılmıştır. Bölümler “Sonraki Bölüm”, “Önceki Bölüm” ve stepper ile değiştirilir. Ziyaret durumu, klinik tamamlanma olarak gösterilmez; zorunlu alan yüzdesi hesaplanmaz.
- `validation.ts`, yalnızca girilen ve o an görünür/uygulanabilir cevapların sayı/tarih/saat/seçenek biçimini kontrol eder. Kullanıcı onaylı tedavi süresi sınırları (negatif olmayan tam yıl, 0–11 tam ay) uygulanır. Diğer klinik alanlarda yeni sınır, skor, CrCl hesabı veya metin kesme sınırı yoktur. VKİ ve tedavi süresi aşağıda açıklanan onaylı hesaplamalardır. Boş cevaplar “Hayır” kabul edilmez.
- Koşullu alt cevaplar metadata’daki `when` ilişkilerinden gösterilir. Üst cevap değişince alt cevaplar gizlenir fakat bellekten silinmez; tekrar görünür olduğunda korunur. Gizli alt cevaplar biçim kontrolünü engellemez. Baskıda bütün alt seçenekler görünür.
- Son adımda **Kaydet**, yalnızca public biçim kontrolünü çalıştırır. Girilmiş geçersiz bir cevabın bölümünü açıp alana scroll/focus yapar; `aria-invalid` ve hata ilişkilendirmesi kullanır. Başarılı kontrol mesajı veri kaydedildiği iddiasında bulunmaz. **Firestore kaydı yoktur**.
- Cevaplar yalnızca React state içindedir. Bölüm, yazdırma ve yönetici modalı geçişlerinde korunur; sayfa yenilenince veya uygunluk yanıtı değişince silinir. localStorage/sessionStorage/IndexedDB’ye yazılmaz.
- DVT lokalizasyonu ve tarafı önceki kullanıcı açıklamasına uygun çoklu seçimdir. Kaynakta checkbox olarak verilen diğer antitrombotikler, inhibitörler ve indükleyiciler de ayrı çoklu seçim değerleridir. Yönetici ekranı placeholder olarak kalır.

## Onaylı veri giriş revizyonları

- `nationalId`: “Hasta TC Kimlik No:” etiketi ve numeric klavye öneren text input. TC numarası string olarak tutulur; harici gerçeklik/kimlik doğrulaması yoktur. Kalıcı depoya veya loga yazılmaz. “Hasta Protokol / ID No” kaldırılmıştır.
- `protocolDate`: yeni form açılırken `getFullYear/getMonth/getDate` ile yerel takvim tarihi atanır; UTC/`toISOString` dönüşümü yapılmaz. Tarih düzenlenebilir ve bölüm değişiminde korunur. Bölüm 7 `assessmentDate` ayrı ve başlangıçta boştur.
- `bmi`: ağırlık / (boy cm / 100)²; bir ondalık basamağa yuvarlanır ve salt okunur gösterilir. Eksik, sonlu olmayan veya pozitif olmayan boy/kiloda boş (`null`) kalır. Boy/kilo değişince yeniden hesaplanır. Örnek: 80 kg / 180 cm → 24.7.
- Endikasyon: yeni formda kaynak seçeneklerindeki DVT/PE yanıtı seçilir; kullanıcı değiştirebilir. “Diğer” metni korunur.
- “Ne Kadar Süredir Apixaban Kullanıyor?”: `treatmentDurationYears` ve `treatmentDurationMonths` ayrı kontrollerdir. Tam yıl ≥ 0, tam ay 0–11. İki değer geçerliyse yıl × 12 + ay hesaplanır. `3` + `4` → “3 yıl 4 aydır”, toplam `40` ay. `0/4`, `1/0`, `0/0` desteklenir; `0/0` yalnızca “0 yıl 0 aydır” olarak gösterilir. Eksik/geçersiz girişte toplam `null` kalır; klinik yorum üretilmez.
- `CrfDraftValues` geçici yıl/ay giriş metnini, sayısal VKİ ve toplam ayı tutar. `toCrfValues` kalıcı sistem için hazır sayısal modeli üretir: `{ treatmentDurationYears: 3, treatmentDurationMonths: 4, treatmentDurationTotalMonths: 40 }`. Bu fonksiyon kayıt veya export yapmaz. `CrfValues`/`PublicCrfValues` bu türetilmiş alanı da taşır.
- `investigatorName`: tek seçim, sırayla Dr. Mehmet, Dr. Yasin, Dr. Tuncay, Dr. Burak, Dr. Adnan, Dr. Rabia. Değer seçilen tam addır. İmza/kaşe alanı dijital, model ve print’ten kaldırılmıştır.

`tests/fixtures/source-crf-0435e3f.txt`, önceki commit’in değiştirilmeyen klinik referansıdır. Testler Bölüm 3–6’yı ve Bölüm 7’nin onay dışındaki içeriğini bu referansla karşılaştırır. Kaynak bölüm/alan metadata’sı korunmuştur; yalnızca onaylı alanlar değişir.

## Kullanım ve görünüm doğrulaması

Aktif formda giriş başlığı küçülür ve uygunluk kontrolü katlanır. Mor tüp uyarısı ve kompakt stepper kaydırma sırasında üstte kalır. Soru kartları masaüstünde iki/üç kolona yerleşir; seçili radio/checkbox seçenekleri ve klavye odağı belirginleşir. Bölüm 5’te 14 soru ile koşullu alt cevaplar aynı kartlarda gösterilir. Önceki/sonraki düğmeleri alt kenarda erişilebilir tutulur. Klinik metinler kısaltılmaz veya ellipsis ile kesilmez.

1366×768’de Bölüm 1, 2 ve 7’nin soru panelleri yaklaşık 555, 448 ve 546 piksel ölçüldü; gezinme düğmeleri viewport içinde kaldı. Bölüm 5 doğal dikey kaydırma kullanır. 1920×1080, 375×812 ve 320×740 kontrollerinde bütün public bölümlerde yatay taşma görülmedi. Yerel tarih için UTC’nin iki tarafındaki saat dilimleri ve hesap sınırları birim testlerinde doğrulandı. Yalnızca kurgu UI değerleri kullanıldı.

## Boş form yazdırma

**Form Yazdır**, aynı metadata’dan bütün yedi bölümü ve 71 alanı içeren boş A4 önizlemesini açar. **Yazdır**, `window.print()` çağırır. **Forma Dön** dijital cevapları korur. Doğrudan tarayıcı yazdırma komutu da tam boş formu gösterir.

Dijital cevaplar kağıda aktarılmaz. Bölüm 4’ün 19 laboratuvarı ve DVT seçenekleri, Bölüm 5’in 14 ana sorusu ve tüm alt seçenekleri, Bölüm 6–7’nin tamamı bulunur. Kaynak birimleri (ör. eGFR mL/dk, Sodyum/Potasyum mEq/L, WBC/PLT K/uL) aynen kullanılır. Yalnızca onaylı revizyonlar uygulanmıştır: TC Kimlik No, Yıl/Ay tedavi süresi, altı hekim seçeneği ve imza/kaşe kaldırılması. Bölüm 1 laboratuvar istisnası korunur. Print üzerinde dijital tarih/endikasyon varsayılanları, hesaplanmış değerler veya seçilmiş hekim işaretlenmez.

`@page` A4/14 mm kenar boşluğu ve siyah-beyaz stiller kullanır. Bölümler yeni sayfada başlar; sorular `break-inside: avoid` ile korunur. Kaynak içeriği küçültülmeden Chromium kontrolünde çıktı **9 sayfadır**; yazıcı/tarayıcı ayarları sayfa sayısını etkileyebilir. Butonlar ve web navigasyonu basılmaz.

`digital-public` yalnızca public bölümleri, `admin-completion` yalnızca Bölüm 4’ü düzenlenebilir kabul eder (`getEditableSections`). Gerçek yönetici işlemleri, Firestore, Authentication, autosave, AHT kod üretimi ve export bu sürüme eklenmemiştir.

## Environment variables

Firebase Project ID: **tezform-2848f**. Firebase Console → Project settings → Your apps bölümünden bir Web app kaydedin ve aşağıdaki altı alanı alın:

| Değişken | Açıklama |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | `tezform-2848f` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Console'daki storage bucket değeri |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

`.env.example` yalnızca şablondur. `.env` ve `.env.*` (şablon dışında) Git tarafından yok sayılır. Vite değişkenleri build sırasında tarayıcıya gömülür ve herkese görünür; bu alanlara özel anahtar, Admin SDK credential veya service account JSON koymayın. Yapılandırma değişince yeniden build/deploy gerekir. API key veri erişim yetkisi vermez; güvenlik Firestore kuralları ve yetkilendirmeye bağlıdır.

## Firebase Console hazırlığı ve güvenlik

1. `tezform-2848f` projesinde Web app kaydı ve Hosting kurulumunu tamamlayın.
2. Cloud Firestore veritabanını uygun veri bölgesinde oluşturun. Test/public kuralları kullanmayın. Mevcut veritabanının kurallarını da kontrol edin.
3. Authentication'ı başlatın; kullanılacak giriş sağlayıcıları, yetkili domainler ve rol modeli sonraki görevde belirlenecek. Bu sürümde giriş veya yönetici erişimi yoktur.
4. Yerelde Firebase CLI ile yetkili hesabınız üzerinden `npx firebase login` çalıştırın. İlk güvenli kuralları açıkça yayınlayın:

```sh
npx firebase deploy --only firestore:rules --project tezform-2848f
```

`firestore.rules` tüm istemci erişimini, oturum açmış kullanıcılar dahil, reddeder. Kurallar dosyasının repoda bulunması canlı kuralların değiştiği anlamına gelmez. Admin SDK/IAM bu kuralları aşabilir; servis hesabını yalnızca deployment için kullanın. Kurallar yayınlanıp yetkilendirme modeli ve testleri tamamlanmadan gerçek klinik veri kullanmayın. Sağlık verisi için erişim, onam, saklama ve yasal gereksinimler ayrıca değerlendirilmelidir.

## Hosting ve GitHub Actions

`firebase.json` production çıktısı olarak `dist` kullanır; SPA yolları `index.html` dosyasına rewrite edilir. `.firebaserc` varsayılan projeyi seçer.

`.github/workflows/deploy.yml`: `main` push → Node 24 → `npm ci` → lint → TypeScript → production build → service account doğrulaması → Firebase Hosting live deployment. Manuel çalıştırma da yalnızca `main` üzerinde mümkündür. Başarısız kontroller deployment'ı durdurur. Bu workflow **yalnızca Hosting** yayınlar; Firestore kurallarını otomatik değiştirmez.

GitHub repository → Settings → Secrets and variables → Actions altında şu **repository secrets** değerlerini tanımlayın:

- `FIREBASE_SERVICE_ACCOUNT_TEZFORM_2848F`: deployment için ayrılmış Google Cloud service account JSON credential.
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID` (`tezform-2848f`)
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Servis hesabına proje düzeyinde yalnızca gerekli `Firebase Hosting Admin` (`roles/firebasehosting.admin`) ve `Service Usage Consumer` (`roles/serviceusage.serviceUsageConsumer`) rollerini verin; Owner/Editor veya hasta verisi erişimi vermeyin. Gerekli Firebase Hosting API erişimini etkinleştirin. JSON anahtarını yalnızca GitHub secret alanına güvenli biçimde girin; dosya olarak repoya koymayın. Anahtarı düzenli döndürün. Uzun vadede anahtarsız Workload Identity Federation'a geçiş önerilir.

Secrets tanımlandıktan ve bu dosyalar `main` dalına gönderildikten sonra Actions sonucunu kontrol edin. Manuel yerel Hosting yayını: `npm run build` ardından `npx firebase deploy --only hosting --project tezform-2848f`. Mevcut görevde canlı deployment veya cloud kuralları yayını yapılmamıştır.
