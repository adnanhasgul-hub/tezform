# Dr. Adnan Hasgül Tez Formu

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

## Form arayüzü

- Antiagregan sorusuna yanıt verilmeden form açılmaz. “Evet” kırmızı uygunsuzluk uyarısı gösterir ve butonu devre dışı bırakır. “Hayır” ile “Formu Doldur” kullanılabilir.
- Dijital public akış yalnızca Bölüm **1, 2, 3, 5, 6, 7** içerir; aynı anda bir bölüm gösterilir. Bölüm 4 yerine yönetici tarafından tamamlanacağı bilgisi bulunur. Bölüm 1’de laboratuvar değişkeni yoktur; laboratuvar/radyoloji yalnızca Bölüm 4’tedir.
- Tek kaynakta 51 CRF alanı vardır: 30 public alan, 21 yönetici alanı. Public alanların 24’ü zorunludur. Zorunluluklar `required: true/false`, erişim `entryRole`, sıra `number` metadata’sıyla belirtilir. Serbest açıklamalar ve kanama olayına ilişkin iki tarih/saat isteğe bağlıdır. Alanların klinik anlamları, seçenekleri ve mevcut sayısal sınırları değiştirilmemiştir. Bu taslak zorunluluklar çalışma protokolüne göre gözden geçirilebilir.
- `validation.ts`, zorunluluk, mevcut sayı aralığı/adımı, seçenek ve tarih/uzunluk doğrulamasını ortak yürütür. İsteğe bağlı alanda girilmiş geçersiz değer de hata verir. İlerleme yalnızca geçerli zorunlu public cevaplardan hesaplanır; Bölüm 4 tamamen hariçtir.
- İlk doldurmada aktif bölüm geçerli olduğunda 450 ms tamamlanma geri bildirimi sonrası sonraki bölüme geçilir. Tamamlanmış bölüme geri dönüldüğünde otomatik geçiş tekrarlanmaz. Önceki/sonraki düğmeleri ve stepper ile bölüm seçilebilir; cevaplar korunur. Yazdırma önizlemesi veya yönetici modalı açıkken otomatik geçiş duraklatılır.
- Son adımda **Kaydet**, bütün public cevapları doğrular. İlk eksik/geçersiz alanın bölümünü açar, alana scroll/focus yapar, `aria-invalid` ve alanla ilişkilendirilmiş hata metni gösterir. Düzeltildiğinde hata temizlenir. Tüm kontroller geçse de yalnızca doğrulama mesajı gösterilir; **Firestore kaydı yapılmaz**.
- Alanlar yalnızca React state içinde tutulur. Firestore, localStorage, sessionStorage veya dosyaya yazılmaz. Sayfa yenilenince ya da uygunluk yanıtı değiştirilince silinir; bölüm, yazdırma görünümü ve yönetici modalı geçişlerinde korunur.
- Tarih, sayı, seçim ve açıklama alanları bir başlangıç taslağıdır. ISTH skoru, CrCl veya klinik karar hesaplanmaz. Boş cevaplar “Hayır” kabul edilmez. Yönetici düğmesi sadece bilgilendirme modalı açar.

## Bölüm 4: yönetici tarafından tamamlanacak alanlar

Bölüm 4, aynı merkezi metadata içinde 21 alan içerir: iki çoklu seçim DVT alanı ve 19 laboratuvar parametresi. Bu alanlar Bölüm 1’de tekrarlanmaz; public stepper, validation ve ilerleme yüzdesinden tamamen hariçtir.

- DVT seviyesi/lokalizasyonu: İliak, Femoral, Popliteal, Üst ekstremite, IVC, SVC, Juguler. Birden fazla seçenek işaretlenebilir.
- DVT tarafı: Sağ, Sol. İkisi birlikte işaretlenebilir.
- Laboratuvar: BUN, Kreatinin, eGFR, Kalsiyum, Sodyum, Potasyum, Total bilirubin, Direkt bilirubin, AST, ALT, Total protein, Albumin, WBC, HGB, PLT, HCT, PT, INR, aPTT.

DVT cevapları `string[]`, laboratuvar cevapları metin biçiminde sayısal değerler olarak tiplenir. `InvestigationValues`, `pending_completion`/`completed` modelinde bütün bu alanları taşır. Çoklu seçim widget’ı, doğrulama ve kağıt seçenekleri `kind: "multiselect"`/`options` metadata’sından üretilir. Gerçek yönetici ekranı veya veri yazımı henüz yoktur.

## Boş form yazdırma

Ana sayfadaki **Form Yazdır**, A4 önizlemesini açar. **Yazdır**, tarayıcının standart `window.print()` diyalogunu çağırır; **Forma Dön**, mevcut dijital cevapları koruyarak geri döner. Doğrudan tarayıcı yazdırma komutu da tam boş formu kullanır.

`PrintCrf`, aynı `crfSections`/`fields` tanımlarından **Bölüm 4 dahil yedi bölümün tamamını** üretir. Dijital cevaplar kağıda aktarılmaz. Elle doldurma kutuları ve işaretlenebilir seçenekler kullanılır. `@page` A4/14 mm kenar boşluğu, siyah-beyaz stiller ve soru bazında `break-inside: avoid` uygulanır; butonlar, navigasyon ve dijital validation görünümü basılmaz. Bölüm 4 yeni sayfada başlar; radyoloji/DVT ve laboratuvar alt başlıkları ilk sorularıyla birlikte tutulur. Alan boyutları küçültülmeden Chromium A4 çıktısı 5 sayfa olarak doğrulanmıştır; tarayıcı/yazıcı ayarları sayfalamayı etkileyebilir.

`digital-public` bağlamında yalnızca public bölümler, `admin-completion` bağlamında yalnızca Bölüm 4 düzenlenebilir (`getEditableSections`). Admin ekranı veya kayıt tamamlama işlemi henüz uygulanmamıştır; `print` bağlamında tüm alanlar boş manuel alanlardır.

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
