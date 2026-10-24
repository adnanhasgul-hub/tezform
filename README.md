# ADNAN TEZ FORMU

React + TypeScript + Vite eCRF; Firebase **Spark** üzerinde Hosting, Authentication ve Firestore kullanır. Cloud Functions, Cloud Run, Admin SDK backend veya ücretli backend yoktur. Bu çalışma henüz commit/push/deploy edilmemiştir; Console önkoşulları aşağıdadır. Mevcut iki sayfalık print optimizasyonu korunmuştur. **Rules emülatörünün resmi indirmesi ağ engeline takıldı; 9 Rules testi henüz çalışmadı. Bu nedenle Rules güvenliği production için doğrulanmış değildir ve testler geçmeden yayınlanmamalıdır.**

## Geliştirme ve kontroller

Node.js 24 (`.nvmrc`), npm ve Rules testleri için Java 21 gerekir.

```sh
npm ci
cp .env.example .env.local
npm run dev
npm test
npm run test:rules
npm run test:ui
npm run lint
npm run typecheck
npm run build
npm run preview
```

Bu cloud ortamında cache dizini yazılamıyorsa npm komutlarına `--cache /workspace/.npm-cache` eklenebilir. UI testleri sistem Chromium'unu kullanır; farklı bir browser yolu için `CHROMIUM_PATH` seçilebilir. Sistem browser'ı yoksa `npx playwright install chromium` ile resmi Playwright browser'ını kurun. Rules runner yalnızca `demo-tezform-rules` emülatör projesini kullanır; production'a bağlanmaz. JAR ilk çalıştırmada resmi kaynaktan indirilir. TLS/artifact doğrulamasını kapatmayın.

`npm test`: CRF metin uyumu, yerel tarih, sayısal VKİ/süre modeli, auth politikası, tahsis ve save state testleri. Saf transaction-port testleri gerçek Rules testlerinin yerine geçmez. `test:rules`: gerçek Firestore emulator üzerinde erişim ve atomik tahsis testleri. `test:ui`: yalnızca test harness'ine enjekte edilmiş save servisiyle hata/modal/print/close davranışı; production kayıt oluşturmaz. Gerçek Console Auth sağlayıcıları ve canlı deployment bu yerel testlerle doğrulanmış sayılmaz.

## Tek klinik kaynak ve veri modeli

`src/components/crf/sections.ts` tek runtime klinik metadata kaynağıdır. Kaynak metin, seçenekler ve koşullu alt cevaplar dijital, gelecekteki admin ve print için ortaktır. Önceki kullanıcı onayları (TC Kimlik No, yerel tarih, otomatik/read-only VKİ, DVT/PE varsayılanı, yıl/ay tedavi süresi ve hekim listesi) korunur. Bölüm 1 laboratuvar bloğu ve imza/kaşe yoktur. Bu turdaki tek yeni klinik değişiklik **Bölüm 7 Tarih alanının kaldırılmasıdır**. Formun tek klinik tarihi Bölüm 1 `protocolDate`'tir; yeni formda yerel bugün seçilir ve düzenlenebilir.

70 metadata alanı vardır: **49 public + 21 Bölüm 4**. Ayrıca modelde türetilmiş `treatmentDurationTotalMonths` vardır. VKİ `bmi` sayısaldır; yıl/ay/toplam ay sayısal modele çevrilir. `3 yıl 4 ay = 40 ay`. Koşullu cevaplar ayrı alanlardır ve kayıtta kaybolmaz. `tests/fixtures/source-crf.txt` güncel onaylı metin referansıdır; `source-crf-0435e3f.txt` geçmiş klinik referansı korur. Testler izin verilen değişiklikler dışında içeriği karşılaştırır.

Public adımlar: **1 → 2 → 3 → 5 → 6 → 7**. Aynı anda bir bölüm görünür. Kaynak zorunluluk belirtmediğinden alanlar keyfi olarak zorunlu yapılmaz; girilmiş, uygulanabilir cevapların biçimi kontrol edilir. Bölüm 4 yalnızca bilgilendirmedir; public validation/kayıt verisine dahil edilmez. Sonraki aşamada admin tarafından tamamlanacaktır.

## Public oturum ve kayıt akışı

Public kullanıcı login ekranı görmez. `ensureAnonymousUser()` Firebase `signInAnonymously` kullanır. Anonymous kimlik ve araştırma cevapları yalnızca bellektedir; uygulama formu localStorage/sessionStorage/IndexedDB'ye yazmaz. Firebase yapılandırması veya anonymous sign-in eksikse form görüntülenebilir; Kaydet anlaşılır bağlantı hatası verir, başarı/kod üretmez. Admin oturumu sessizce anonymous oturuma çevrilmez.

“Formu Kaydet”, biçim kontrolünden sonra tek immutable snapshot ve `crypto.randomUUID()` requestId oluşturur. Devam eden save'e ikinci tıklama yeni işlem başlatmaz. Cevaplar ilk denemeden sonra kilitlenir; hata veya kaybolan yanıt sonrasında aynı snapshot + requestId ile tekrar denenir. Bu, kaydedilmiş eski cevaplarla farklı bir local formun basılmasını engeller. Belirsiz isteği iptal edip yeni kimlik üretmek yerine aynı istek tekrar denenmelidir. Bekleyen/belirsiz kayıt sırasında beforeunload uyarısı vardır.

Transaction sunucu tarafından commit edilmeden başarı gösterilmez. Connection hatası ve transaction hatası kullanıcıya teknik ayrıntı/TC göstermeyen mesajlarla sunulur. Payload, TC veya parola loglanmaz; TC URL/query string'e konmaz.

## AHT tahsisi ve Firestore yapısı

AHT kodu credential değildir. Hasta doküman kimliği Firestore'un rastgele 20 karakterli ID'sidir.

```text
systemCounters/subjects
  lastAllocatedNumber: -1                  # Console'da ilk kurulum
  # İlk commit sonrasında eklenen atomik eşleştirme alanları:
  lastSubjectId, lastRequestId, lastCreatedByUid

systemCounters/reusableSubjects                 # ilk yetkili silmede oluşturulur
  numbers: [2, 4]                               # sıralı benzersiz reusable numaralar
  lastSubjectId, operation, insertIndex

subjects/{randomSubjectId}
  subjectCode: AHT-000
  subjectNumber: 0
  status: pending_completion
  createdAt: serverTimestamp
  updatedAt: serverTimestamp
  createdByUid: anonymous Auth UID
  requestId: UUIDv4
  publicValues: {49 public cevap + treatmentDurationTotalMonths}
  investigations: {}

submissionRequests/{uid}/requests/{requestId}
  subjectId, subjectCode, subjectNumber, requestId   # klinik veri yok

admins/{uid}
  # Belgenin varlığı admin yetkisi verir; alanları yetki kontrolünde kullanılmaz.
```

`registrationCore.ts` formatter'ı `0 → AHT-000`, `1 → AHT-001`, `9 → AHT-009`, `27 → AHT-027`, `999 → AHT-999`, `1000 → AHT-1000` üretir. Başlangıç `-1 + 1 = 0` olduğundan ilk tahsis AHT-000'dır. **Kayıt sayısı/count, tarih veya localStorage kullanılmaz.** Counter yoksa client oluşturmaz; hata verir.

Tek Firestore transaction önce kendi receipt'ini okur. Receipt varsa klinik dokümanı okumadan ilk sonucu döndürür. Yoksa counter okunur, +1 numara hesaplanır; yeni subject, receipt ve counter beraber yazılır. Çakışmada Firestore transaction yeniden denenir. Receipt path UID + requestId ile kapsamlanır. Farklı UID'lerin aynı UUID'yi kullanması farklı istektir. Client her yeni formda yeni requestId kullanır.

Counter geriye alınmaz. Yetkili yönetici şifresini Firebase ile tekrar doğruladıktan sonra subject silme, kodu reusable havuza koyma ve receipt revocation aynı transaction içinde yapılır. Receipt silinmez; `revoked: true` tombstone olur ve eski browser dahil public read Rules tarafından reddedilir. Console'da counter resetlemek veya receipt geçmişini bozmak bu garantiyi bozar; gerçek veri varken bunu yapmayın.

## Rules ve Spark sınırları

`firestore.rules` erişimi istemci adına denetler:

- Kimliksiz kullanıcı: subject/counter/admin/receipt erişimi yok.
- Anonymous: yalnızca gerekli counter `get`, kendi UID'sine ait tek receipt `get`, ve yeni subject + receipt + counter'ın **aynı atomik write** içinde oluşturulması. `getAfter()`/`exists()` bağlarıyla bağımsız counter increment, decrement, +10, public initialization, eksik eş belge veya eski subject/receipt yeniden kullanımı engellenir.
- Anonymous kullanıcı **kendi subject'ini bile okuyamaz**; list/query/get, subject update/delete, başkasının receipt'i, receipt list/update/delete, admins read/write kapalıdır.
- Admin: anonymous olmayan Firebase kimliği + `admins/{uid}` varlığı. Subject get/list açıktır; klinik değer güncellemeleri immutable allocation alanları korunarak yapılır. Delete için password provider, son 5 dakika içinde gerçek Auth doğrulaması, atomik kod release ve receipt revocation gerekir. Admin kullanıcı yalnızca kendi marker'ını okuyabilir. Client, admin marker'ı oluşturamaz/değiştiremez/silemez.
- Public create yalnızca izin verilen veri anahtarları, tipler, boş investigations, doğru numara/kod, doğru UID, requestId ve server timestamp'lerle yapılabilir. Bu, verinin klinik doğruluğunun veya hastanın kimliğinin server tarafından doğrulandığı anlamına gelmez.

**Bu yapı trusted backend kadar güçlü değildir.** Her anonymous kullanıcı counter'ın son sayısını ve coupling metadata'sını (opaque UID, random ID ve requestId) okuyabilir; bunlarda TC/klinik cevap yoktur. Firestore field-level redaction yapmaz. Rules geçerli +1 tahsisi zorunlu kılar fakat saldırganın yeni anonymous kimlik/isteklerle geçerli görünümlü kayıt üretmesini veya Spark günlük kotasını tüketmesini tamamen engelleyemez. UID başına idempotency aynı hastanın farklı isteklerle tekrar kaydını engellemez. App Check ek savunma olabilir; tek başına kullanıcı yetkilendirmesi veya kesin rate limit değildir. Burada App Check kurulmuş olduğu iddia edilmez. Bu sınırlar kabul edilmeden sistemi hassas production veriyle kullanmayın.

Auth oturumu in-memory olduğu için reload/tab kapatılması UID ve snapshot'ı kaybettirir. Public own-subject read kasıtlı olarak kapalıdır; kayıtlı form public tarafta sonradan geri yüklenemez. Admin erişimi ve bir sonraki aşamadaki panel bu ihtiyacı karşılayacaktır. Refresh ile yeni kayıt açmak ilk kaydı silmez ve numarayı geri kullanmaz.

## Kayıt sonrası kod, print ve kapatma

Gerçek transaction sonucu gelince native modal açılır: “KAYIT BAŞARIYLA TAMAMLANDI”, “HASTAYA ATANAN KOD” ve büyük AHT kodu. Escape ve dış tıklama kapatmaz; X yoktur. “Kodu Kopyala” hata verirse modal açık kalır, elle kaydetme mesajı gösterilir. Pulse, `prefers-reduced-motion` ile kapatılır. **Kodu Kaydettim** onayından önce print/close eylemleri ve dolu print içeriği açılmaz.

Onaydan sonra kod görünür kalır, **Formu Yazdır** `window.print()` çağırır; yeni kayıt/numara tahsis etmez. **Formu Kapat** browser sekmesini zorla kapatmaz; local form/receipt state'ini temizleyip başlangıca döner. Firestore kaydı silinmez.

Boş form print ana ekranda korunur. AHT alanı boş çizgidir; DVT/PE ve yerel tarih gibi digital defaults kağıda işaretlenmez. Dolu print, commit edilen immutable snapshot ve kodu kullanır. Bölüm 4 tüm seçenekleriyle ve boş olarak basılır; Bölüm 7 Tarih yoktur. A4 portrait/8 mm, iki kolon, yaklaşık 8.5 pt gövde ve 10 pt bölüm başlığı korunmuştur. Çok uzun serbest metin çıktıyı büyütebilir; metin kesilmez.

## Admin URL, alias ve parola

`/admin` ekranında yalnızca Kullanıcı Adı ve Şifre vardır. Görsel alias **adnan**, auth hesabı `VITE_ADMIN_AUTH_EMAIL` ile seçilir. Bu Vite değişkeni **bundle'da görünür**; e-posta identifier'ını client-only Email/Password mimarisinde gizlemek mümkün değildir. Bu nedenle kişisel e-posta yerine yalnızca authentication için ayrılmış, kontrolünüzdeki teknik e-posta/alias kullanın. Env kullanımı identifier'ı secret yapmaz. Auth identifier'ı bilmek yetki vermez.

Parola Firebase Authentication tarafından doğrulanır; source/env/fixture/log/Firestore veya localStorage'a yazılmaz. Yanlış alias ve yanlış parola aynı genel hatayı verir. Başarılı Auth yeterli değildir: UID marker'ı ayrıca kontrol edilir. Marker yoksa dashboard ve hasta verisi yüklenmez. Anonymous kimlik marker'ı olsa bile admin sayılmaz. Marker alanında false yazmak yetkiyi kaldırmaz; marker belgesini silmek gerekir.

Panel hasta listesi, hekim araması, Bölüm 4 kısmi kayıt, tüm form düzenleme, tam görüntüleme, dolu print ve yeniden şifre doğrulamalı silme sağlar. Export eklenmemiştir. Çıkış Yap Auth oturumunu kapatıp login'e döner. Auth in-memory olduğu için reload da yeni login gerektirir.

## Firebase Console: manuel adımlar (henüz uygulanmadı)

1. **Spark** projesini `tezform-2848f` olarak doğrulayın. Firestore `(default)` veritabanını ve veri bölgesini kontrol edin. Hiçbir Functions/Run servisi veya billing upgrade gerekmez.
2. Project settings → Your apps → Web app: altı mevcut `VITE_FIREBASE_*` alanını `.env.local` veya güvenli ortam ayarına girin. `.env` dosyalarını Git'e eklemeyin.
3. Authentication → Sign-in method → **Anonymous → Enable**.
4. Authentication → Sign-in method → **Email/Password → Enable**. SMS/telefon sağlayıcısı gerekmez.
5. Authentication → Users → Add user: sadece auth için ayrılmış teknik bir email identifier ve Console'da belirlediğiniz güçlü parola ile admin hesabını oluşturun. Parolayı chat, README veya repository'ye koymayın. UI hiçbir zaman email sormaz.
6. Hesabın UID'sini alın. Firestore → `admins` collection → document ID **tam UID** → örneğin `provisioned: true` metadata alanıyla belgeyi oluşturun. Yetki belge varlığına bağlıdır. Başkasının UID'sini kullanmayın.
7. Firestore → `systemCounters` collection → `subjects` document → integer **lastAllocatedNumber: -1**. Bunu yalnızca henüz hiçbir kod tahsis edilmemiş yeni kurulumda yapın. Mevcut counter/kayıt geçmişi varsa **resetlemeyin**, mevcut tahsisleri incelemeden -1 yazmayın. Transaction kalan coupling alanlarını ilk kayıtta ekleyecek.
8. `.env.local` içinde **VITE_ADMIN_AUTH_EMAIL** değerine teknik email identifier'ını girin. GitHub Repository → Settings → Secrets and variables → Actions → **Repository Secrets** altında aynı adı/değeri tanımlayın. Bu public identifier'dır; parola değildir. Mevcut altı Firebase web config secret'ını koruyun. Workflow yalnızca bu yeni public variable'ı build'e ekler; deploy komutu Hosting olarak kalır.
9. Authentication → Settings → Authorized domains bölümünde gerçek Hosting domainlerinizi ve geliştirme için localhost'u doğrulayın. Anonymous ve Email/Password akışını önce kurgu/test ortamında kontrol edin.
10. **Rules emülatör testleri geçtikten ve kullanıcı incelemesi/onayı tamamlandıktan sonra**, `firestore.rules` içeriğini Console Rules ekranında yayınlayın. Alternatif yetkili CLI komutu `npx firebase deploy --only firestore:rules --project tezform-2848f` olur. Bu görevde yayın yapılmadı; Hosting workflow'u Rules yayınlamaz. Eski deny-all canlıysa kayıt güvenli biçimde hata verir.
11. Kod ve Console ayarları onaylandıktan sonra ayrı commit/push/Hosting yayın adımını uygulayın. Bu görevde **commit/push/deploy yoktur**. Üretimde kurgu kayıt da numara tüketir; sıra testlerini demo emülatörde yapın, production counter'ı geri almayın.

## Dosyalar ve deployment

- `src/firebase/client.ts`: mevcut modüler Web SDK; varsayılan bellek Firestore cache'i, kalıcı araştırma cache'i etkin değil.
- `src/services/auth.ts` / `authPolicy.ts`: görünmez anonymous oturum, admin alias/UID guard.
- `registrationCore.ts` / `registration.ts`: formatter, veri whitelist'i, gerçek transaction adapter'ı.
- `submissionState.ts`: snapshot/requestId/double-click/retry kontrolü.
- `RegistrationComplete.tsx`: zorunlu kod modalı ve onay sonrası eylemler.
- `/admin`: `AdminPage`, guard ve logout; public kayıt verilerini yüklemez.
- `tests/rules/run.mjs`: gerçek demo emülatör test runner'ı; production'a yönelmez.

`dist/`, SPA rewrites, proje ID, mevcut VITE_FIREBASE değişken isimleri ve Hosting deployment yapısı korunmuştur. Yeni admin email variable'ı Vite build-time değeridir; değiştirilince yeniden build gerekir. SDK runtime credential veya service-account private key client'a konmaz. Firebase/GitHub bağlantılarının bu çalışma ortamında canlı doğrulaması yapılmamıştır; Console ayarlarının etkin olduğu varsayılmaz.

## Bu çalışma ortamındaki doğrulama sınırı

Resmi `cloud-firestore-emulator-v1.22.0.jar` indirmesi `storage.googleapis.com` CONNECT **403** ile engellendi; sandbox dışındaki tekrar da aynı sonucu verdi. Ağ izinlerine bu resmi host eklendikten sonra `npm run test:rules` yeniden çalıştırılmalıdır. Yazılan **9 Rules testi henüz çalıştırılmadı**; statik inceleme, çalışan bir güvenlik testi sayılmaz. Bu Rules taslağını testler geçmeden production'a yayınlamayın. Parola/provider/UID/Console ve canlı deployment kontrolleri de manuel önkoşullardan sonra yapılacaktır.

## Yönetici kayıt yönetimi ve yeniden kullanım

Bölüm 4 UI durumu merkezi 21 alanın gerçek değerlerinden hesaplanır: `Boş` (kırmızı), `Devam Et` (turuncu), `Tamamlandı` (yeşil). String trim sonrası boşsa, multiselect boşsa doldurulmuş sayılmaz. Persistence için `status`, yalnız tüm alanlar doluysa `completed`, diğer durumlarda `pending_completion` kalır; eski status tek başına UI durumu belirlemez. Kısmi kayıt ve Kaydet ve Listeye Dön desteklenir.

`systemCounters/reusableSubjects` ilk yetkili silmede otomatik oluşturulur; migration veya counter reset gerekmez. `numbers` artan sıralı benzersiz liste; `lastSubjectId`, `operation` ve `insertIndex` atomik işlem doğrulama alanlarıdır. Rules sıralı insertion'ı eski listeyi aynen koruma ve komşu sınırlarıyla doğrular. Public allocation yalnız ilk (en küçük) sayıyı tüketebilir. Havuz boşsa high-water counter tam +1 artar; reuse sırasında high-water değişmez. Tüm belge yazmaları gerçek Firestore transaction içindedir; mevcut 4 denemelik allocation retry korunur. Ortak pool belgesi Firestore 1 MiB belge sınırına tabidir; sınır aşılırsa işlem güvenli biçimde hata verir, havuz atlanmaz.

Admin tam düzenleme yalnız `publicValues`, `investigations`, `status`, `updatedAt` alanlarını günceller. Random belge ID'si, AHT kodu/numarası, `createdAt`, UID ve requestId korunur; counter ve receipt yazılmaz. Public validation ve klinik metadata değiştirilmez. Hekim sütunu mevcut `publicValues.investigatorName` alanından gelir; arama client tarafındadır ve yeni index gerektirmez.

Print component'i `document.body` altında portal olarak render edilir. Bu, print CSS'inin gizlediği `.app-shell` parent'ından bağımsızdır. Browser regression testi hem gerçek print media görünürlüğünü hem 70 alanı, AHT kodunu ve Bölüm 4 değerlerini doğrular.

Deployment sırası: emulator testleri → kontrollü manuel Rules yayını → PR/merge → mevcut Hosting workflow'u. Yeni Rules production yayını doğrulanmadan admin UI Hosting'e yayınlanmaz. Production verisi üzerinde test yapılmaz.
