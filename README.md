# Dr. Adnan Hasgül Tez Formu

Apixaban Farmakogenetik ve Klinik Kanama Değerlendirme Sistemi için web eCRF geliştirme altyapısı. Bu sürüm yalnızca test ana sayfası ve Firebase/deployment hazırlığı içerir. Gerçek CRF, hasta kayıt ekranı, yönetici paneli ve SPSS export bulunmaz. Hasta/test hasta verisi oluşturulmaz.

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

`build`, TypeScript kontrolü ve Vite production build yapar; çıktı `dist/` dizinidir. Otomatik birim test paketi henüz yoktur. Firebase SDK'nın dolaylı Node.js gRPC bağımlılığındaki güvenlik bildirimleri nedeniyle `@grpc/grpc-js` için `^1.14.6` override uygulanmıştır; lockfile bu düzeltmeyi korur. Production bağımlılık taraması: `npm audit --omit=dev`. Firebase ayarları olmadan sayfa açılır ve “Yapılandırılacak” gösterir. Gösterge kartlarında Hazır ifadesi servis entegrasyonunun hazır olduğunu belirtir; uzak bağlantı veya izin testi değildir.

## Mimari

- `src/pages/`: sayfalar; `HomePage` ilk altyapı ekranıdır.
- `src/components/`: tekrar kullanılabilir arayüz parçaları.
- `src/firebase/client.ts`: modüler Firebase SDK; App, Authentication ve Firestore başlangıcı. Eksik ayarlarda servisler `null` kalır. Tüketiciler bunu kontrol etmelidir.
- `src/types/`: ortak TypeScript tipleri.
- `src/services/`, `src/utils/`: ilerideki servis ve yardımcılar için ayrılmıştır.

Firebase başlangıcı veri okumaz/yazmaz, oturum açmaz. Kalıcı Firestore offline cache etkinleştirilmemiştir. Hareket azaltma tercihi mor uyarının yavaş animasyonunu kapatır.

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
