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

`build`, TypeScript kontrolü ve Vite production build yapar; çıktı `dist/` dizinidir. Merkezi doğrulama ve bölüm erişimi testleri Node.js 24 ile `node --test tests/crf-validation.test.ts` komutuyla çalışır (ek bağımlılık gerektirmez). Firebase SDK'nın dolaylı Node.js gRPC bağımlılığındaki güvenlik bildirimleri nedeniyle `@grpc/grpc-js` için `^1.14.6` override uygulanmıştır; lockfile bu düzeltmeyi korur. Production bağımlılık taraması: `npm audit --omit=dev`. Form arayüzü Firebase ayarları olmadan da açılır; bu aşamada Firebase servislerine bağlanmaz.

## Mimari

- `src/pages/`: `HomePage`, antiagregan uygunluk kontrolü ve form açma akışını yönetir.
- `src/components/crf/`: tek kaynak bölüm/alan metadata’sı (`sections.ts`), merkezi doğrulama (`validation.ts`), kontrollü alan bileşeni (`FormField`), dijital stepper/state (`CrfForm`) ve boş basılı form (`PrintCrf`).
- `src/components/AdminPlaceholder.tsx`: klavye ve Escape ile kullanılabilen yerel dialog.
- `src/firebase/client.ts`: modüler Firebase SDK; App, Authentication ve Firestore başlangıcı. Eksik ayarlarda servisler `null` kalır. Tüketiciler bunu kontrol etmelidir.
- `src/types/crf.ts`: alanlar, public/admin bağlamları ve gelecekteki kayıt için strict TypeScript tipleri. `CrfRecord` modeli public cevaplarla yönetici bulgularını ayırır: `pending_completion` ilk klinik aşamanın bitip Bölüm 4’ün beklendiğini, `completed` yönetici aşamasının da tamamlandığını belirtir. Bu aşamada kayıt nesnesi oluşturulmaz veya status güncellenmez.
- `src/services/`, `src/utils/`: ilerideki servis ve yardımcılar için ayrılmıştır.

Firebase başlangıcı veri okumaz/yazmaz, oturum açmaz. Kalıcı Firestore offline cache etkinleştirilmemiştir. Hareket azaltma tercihi mor uyarının yavaş animasyonunu kapatır.

## Kaynak CRF ve form arayüzü

Klinik içerik, kullanıcı tarafından sağlanan kaynak CRF’den alınmıştır. Çalışan uygulamanın tek soru kaynağı `src/components/crf/sections.ts` dosyasıdır. Başlık, klinik uyarı, bölüm/alt kategori başlıkları, soru metinleri, parantez açıklamaları, seçenekler ve birimler bu metadata’dan dijital ve basılı formda gösterilir. Test referansı `tests/fixtures/source-crf.txt`, boş çizgi/kutu görselleştirmeleri hariç kabul edilen kaynak klinik metnin bağımsız transkriptidir; runtime soru listesi değildir. Testler yalnızca boşluk/satır sarmasını normalize ederek klinik metni baştan sona karşılaştırır.

Tek bilinçli klinik içerik istisnası: Bölüm 1’deki **Son Laboratuvar Değerleri (Varsa)** bloğu ve **Serum Kreatinin, Tahmini CrCl (Klerens), ALT / AST, Hemoglobin (Hb)** alanları dijital ve basılı formda bulunmaz. Bölüm 4 laboratuvarları eksiksiz korunur.

| Bölüm | Veri alanı sayısı |
| --- | ---: |
| 1 | 9 |
| 2 | 5 |
| 3 | 5 |
| 4 | 21 |
| 5 | 18 |
| 6 | 7 |
| 7 | 6 |
| Toplam | **71** |

Public cevap modeli 50, yönetici/Bölüm 4 modeli 21 alan içerir. Sayılar bağımsız cevap değerlerini kapsar: “Diğer” metinleri, sıklık/süre/boyut alt cevapları, transfüzyon miktarı ve ara süresi ayrı alanlardır. Uygunluk sorusu CRF’ye dahil değildir.

- Başlangıçtaki antiagregan sorusu çalışma öncesi uygulama kontrolüdür. “Evet” formu açmayı engeller; “Hayır” ile “Formu Doldur” kullanılabilir. Bu soru basılı kaynak CRF’ye eklenmez.
- Public dijital akış **1 → 2 → 3 → 5 → 6 → 7** olarak kalır. Aynı anda bir bölüm görünür. Bölüm 4 yalnızca yönetici bilgilendirmesiyle temsil edilir; kullanıcıya düzenlenebilir alanları gösterilmez.
- Kaynak zorunluluk belirtmediğinden **tüm klinik alanların `required` değeri false**. Önceki keyfi zorunluluklar ve otomatik ilerleme kaldırılmıştır. Bölümler “Sonraki Bölüm”, “Önceki Bölüm” ve stepper ile değiştirilir. Ziyaret durumu, klinik tamamlanma olarak gösterilmez; zorunlu alan yüzdesi hesaplanmaz.
- `validation.ts`, yalnızca girilen ve o an görünür/uygulanabilir cevapların sayı/tarih/saat/seçenek biçimini kontrol eder. Kaynak dışı klinik sınır, skor, VKİ veya CrCl hesaplaması ve metin kesme sınırı yoktur. Boş cevaplar “Hayır” kabul edilmez.
- Koşullu alt cevaplar metadata’daki `when` ilişkilerinden gösterilir. Üst cevap değişince alt cevaplar gizlenir fakat bellekten silinmez; tekrar görünür olduğunda korunur. Gizli alt cevaplar biçim kontrolünü engellemez. Baskıda bütün alt seçenekler görünür.
- Son adımda **Kaydet**, yalnızca public biçim kontrolünü çalıştırır. Girilmiş geçersiz bir cevabın bölümünü açıp alana scroll/focus yapar; `aria-invalid` ve hata ilişkilendirmesi kullanır. Başarılı kontrol mesajı veri kaydedildiği iddiasında bulunmaz. **Firestore kaydı yoktur**.
- Cevaplar yalnızca React state içindedir. Bölüm, yazdırma ve yönetici modalı geçişlerinde korunur; sayfa yenilenince veya uygunluk yanıtı değişince silinir. localStorage/sessionStorage/IndexedDB’ye yazılmaz.
- DVT lokalizasyonu ve tarafı önceki kullanıcı açıklamasına uygun çoklu seçimdir. Kaynakta checkbox olarak verilen diğer antitrombotikler, inhibitörler ve indükleyiciler de ayrı çoklu seçim değerleridir. Yönetici ekranı placeholder olarak kalır.

## Boş form yazdırma

**Form Yazdır**, aynı metadata’dan bütün yedi bölümü ve 71 alanı içeren boş A4 önizlemesini açar. **Yazdır**, `window.print()` çağırır. **Forma Dön** dijital cevapları korur. Doğrudan tarayıcı yazdırma komutu da tam boş formu gösterir.

Dijital cevaplar kağıda aktarılmaz. Bölüm 4’ün 19 laboratuvarı ve DVT seçenekleri, Bölüm 5’in 14 ana sorusu ve tüm alt seçenekleri, Bölüm 6–7’nin tamamı bulunur. Kaynak birimleri (ör. eGFR mL/dk, Sodyum/Potasyum mEq/L, WBC/PLT K/uL) aynen kullanılır. Bölüm 1 laboratuvar istisnası dışında klinik metin çıkarılmamıştır.

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
