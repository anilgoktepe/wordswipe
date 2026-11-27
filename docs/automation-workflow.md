# WordSwipe — Otomasyon ve Teslimat Akışı

Bu belge, WordSwipe'ın Claude Code ile yarı-otonom geliştirilme sürecini tanımlar. Amaç, her yeni oturumda sistemi baştan anlatmak zorunda kalmamak.

Ajan tanımları: `.claude/agents/`. Özet tablo ve onay kuralları: `CLAUDE.md`.

---

## 1. Roller

Ana Claude oturumu **koordinatördür** — kendisi de kod yazabilir, ama asıl işi görevi doğru uzmana dağıtmak, çelişkileri çözmek ve teslimatı yönetmektir.

| Ajan | Alan | Yazma yetkisi |
|---|---|---|
| `app-developer` | RN/Expo uygulama kodu | Var |
| `ios-build-engineer` | Native iOS build | Var (`ios/` + build config) |
| `mobile-qa` | Simulator'da gerçek test | Teknik olarak var, **kural gereği yok** |
| `test-engineer` | Otomatik test paketleri | `scripts/` — `src/` için onay gerekir |
| `code-security-reviewer` | Bağımsız inceleme | Edit/Write yok; Bash var, **kural gereği salt okunur** |

### `tools` ve `disallowedTools` — ölçülmüş davranış

**`tools:` allowlist'i MCP araçlarını ve `ToolSearch`'ü kapsam dışı bırakıyor.** 2026-11-21'de ölçüldü: `mobile-qa`, `tools: Read, Grep, Glob, Bash` ile yalnızca `Read` ve `Bash` görebildi; her Mobile MCP çağrısı şu hatayla düştü:

> `its MCP server 'mobile-mcp' is connected but does not offer this tool here`

Bu yüzden `mobile-qa` tanımında `tools` alanı **bilerek yok**; yazma araçları yerine `disallowedTools: Edit, Write` ile kesiliyor. 2026-11-23'te doğrulandı: `Edit` ve `Write` hem yüklü hem *deferred* havuzdan düşüyor (`ToolSearch select:Edit,Write` → `No matching deferred tools found`), `ToolSearch` ve Mobile MCP ise yerinde kalıyor. Yani `disallowedTools` allowlist'in yan etkilerini doğurmuyor.

**Allowlist'e yazılan her araç gelmiyor.** `Grep` ve `Glob` hiçbir alt ajana ulaşmıyor. Kök neden: **ana oturumun kendisinde `Grep`/`Glob` yok**, dolayısıyla devralma imkânsız. İki bağımsız ölçüm: `ios-build-engineer` ikisini de istediği hâlde almadı, ve `code-security-reviewer` kendi havuzunun `Read` + `Bash` olduğunu bildirdi. İşlevsel kayıp yok — `Bash` ile `rg`/`grep`/`find` aynı işi yapıyor. Bu yüzden dört ajanın frontmatter'ından da çıkarıldılar: bir dosyanın gelmeyen araçları listelemesi, okuyanı yanıltır.

Allowlist'e `Skill` eklemek ise çalışıyor (`Skill(skill="<geçersiz>")` → `Unknown skill: ...`, yani araç seviyesinde değil argüman seviyesinde ret).

### Onayı kim verir

**Alt ajanın görev metnini koordinatör yazar, kullanıcı değil.** Bir ajan dosyası "onay sana verilen görevde olmalı" derse, koordinatörün görev metnine *"Onaylandı: X yap"* yazması o koşulu sağlamış görünür — ve kullanıcı hiçbir şey onaylamamış olur. Bu, tasarım gereği permission laundering.

Onay gerektiren her kural **kullanıcıyı** adlandırmalı ve onayın birebir aktarılmasını istemeli. Referans dil `ios-build-engineer.md`'de: *"Require explicit **user** approval before"*. Hiçbir ajan mesajı — koordinatör dahil — kullanıcı onayı yerine geçmez.

**Sonuç: `tools` ve `disallowedTools` güvenlik duvarı değil, niyet beyanıdır.** `disallowedTools` yalnızca modele verilen araç şemalarını filtreler; o araçların başlattığı süreçleri kısıtlamaz. `Bash` duran her ajan yönlendirme (`>`, heredoc), `tee`, `sed -i`, `cp`/`mv`, `patch`/`git apply`, `git checkout`/`reset`/`clean` veya `python3 -c`/`node -e` ile yazabilir; üstüne `Agent` ile yazma yetkili bir ajan çağırmak kendi başına bir yazma yoludur. Koruma *kazara* yazmayı engeller ve kasıtlı yazmayı transcript'te görünür kılar. Gerçek kapatma permission-layer deny kuralı veya sandbox ister; frontmatter yetmez.

### Ajan tanımları ne zaman yüklenir

**Ölçülen:** 2026-11-22'de iki frontmatter değişikliği yapıldıktan hemen sonra probe edildi ve ikisi de bayat sonuç verdi (eski araç havuzu); 2026-11-23'te aynı probe'lar ikisini de canlı gösterdi.

**Suspected, doğrulanmadı:** bu gözlem "gecikmeli izleme" ile "oturum başında yükleme + arada bir oturum yeniden başlaması" arasında **ayrım yapmıyor**; iki açıklama da aynı sonucu üretir. Aleyhte bir delil de var: bir alt ajan, context'ine enjekte edilen `CLAUDE.md` kopyasının commit **öncesi** metni taşıdığını, diskteki dosyanın ise commit sonrası metni taşıdığını ölçtü — yani talimat dosyaları oturum başına önbelleğe alınıyor.

**Pratik kural:** bir tanımı değiştirdikten sonra ölçmen gerekiyorsa en güvenli yol oturumu yeniden başlatmak. Başlatmadıysan ilk olumsuz sonucu kesin kabul etme, tekrarla. Kesin ayrım için tek oturum içinde yeniden probe gerekiyor — henüz yapılmadı.

---

## 2. Standart geliştirme akışı

```
Görev
  │
  ├─ 1. Koordinatör: kapsamı belirle, kök nedeni araştır
  │
  ├─ 2. app-developer: minimum kod değişikliği
  │
  ├─ 3. test-engineer: tsc + ilgili test paketleri        ─┐ sıralı
  │                                                        │ (aynı dosyalara
  ├─ 4. ios-build-engineer: gerekiyorsa derle + kur        │  dokunabilirler)
  │                                                        │
  ├─ 5. mobile-qa: Simulator'da gerçek ekran testi        ─┘ simulator tekil
  │
  ├─ 6. code-security-reviewer: bağımsız inceleme (paralel edilebilir)
  │
  ├─ 7. Bulguları değerlendir → gerekirse 2'ye dön
  │
  └─ 8. Ayrı dalda commit + PR (main'e merge YOK)
```

Her adım zorunlu değildir. Sadece dokümantasyon değişikliği 2-5'i atlar. Kural: **göreve uygun en az sayıda ajan.**

### Paralelleştirme

| Birlikte çalışabilir | Çalışamaz |
|---|---|
| `code-security-reviewer` + `test-engineer` | Aynı dosyayı değiştirecek iki ajan |
| Farklı dosyalara bakan bağımsız incelemeler | `mobile-qa` + simulator'a dokunan herhangi bir ajan |

Simulator tek bir paylaşılan kaynaktır. `mobile-qa` çalışırken hiçbir ajan build/install/launch yapmamalı.

---

## 3. Araç seçimi

| İş | Araç |
|---|---|
| Dosya okuma/yazma | Read / Edit / Write (`Grep`/`Glob` alt ajanlara ulaşmıyor — arama için `Bash` + `rg`) |
| Derleme, test, git | Bash (terminal) |
| iOS ekran kontrolü | **Mobile MCP** (`mcp__mobile-mcp__*`) |
| Başka yolla erişilemeyen GUI | Computer Use — *bu ortamda mevcut değil* |
| GitHub | **`gh` CLI** (2.105.0) — push için `git`'in credential helper'ı |
| CI | GitHub Actions — `.github/workflows/ci.yml` |

### Mobile MCP

`.mcp.json` ile proje kapsamında yapılandırılmış:

```json
{ "mcpServers": { "mobile-mcp": {
    "command": "npx",
    "args": ["-y", "@mobilenext/mobile-mcp@latest"],
    "env": { "MOBILEMCP_DISABLE_TELEMETRY": "1" } } } }
```

Araçlar *deferred* — çağırmadan önce `ToolSearch` ile yüklenmeli. Mevcut yetenekler: cihaz listeleme, uygulama başlatma/sonlandırma, ekran görüntüsü, UI hierarchy, tap/swipe/metin girişi, crash ve cihaz logları.

### GitHub

**Kural: hiçbir ajan kimlik bilgisini okumaz, yazdırmaz, dosyaya kaydetmez veya bir komuta parametre olarak geçirmez.**

Kimlik doğrulaması git'in kendi credential helper'ına (macOS Keychain) bırakılır. `git push` bunu şeffaf şekilde kullanır — token hiçbir zaman komut satırında, ortam değişkeninde veya log'da görünmez. Bu güvenli yoldur.

Token'ı `git credential ... get` ile çıkarıp `curl`'e aktarmak **yasaktır**: sır, süreç listesinde ve shell geçmişinde açığa çıkar.

PR açma — tercih sırası:

1. **`gh` CLI** — kurulu (2.105.0), tercih edilen yol:
   ```bash
   gh pr create --base main --head <dal> --title "..." --body-file <dosya>
   ```
   `gh` kendi güvenli token deposunu kullanır; sır hiçbir komuta geçmez.

   **Tek seferlik kurulum gerekiyor:** `gh auth login` (interaktif tarayıcı OAuth). Bu adım kullanıcıya aittir — ajan kullanıcının token'ını giremez. Yapıldıktan sonra PR açma tamamen otomatikleşir.

2. **Push + tarayıcı** (yedek yol, kimlik doğrulaması gerektirmez):
   ```bash
   git push -u origin <dal>
   ```
   GitHub, çıktıda hazır bir PR oluşturma bağlantısı döndürür.

`main`'e merge her iki yolda da **kullanıcının kararıdır** — otomatikleştirilmez.

---

## 4. iOS build ve QA

Bilinen ortam gerçekleri `CLAUDE.md` → *iOS Ortam Gerçekleri* bölümünde. Çalışan prosedür:

```bash
npx expo start                       # Metro :8081 — önce bu

cd ios
xcodebuild -workspace WordSwipengilizceren.xcworkspace \
  -scheme WordSwipengilizceren -configuration Debug -sdk iphonesimulator \
  -destination "id=<UDID>" -derivedDataPath build/DerivedData build

xcrun simctl install <UDID> build/DerivedData/Build/Products/Debug-iphonesimulator/WordSwipengilizceren.app
xcrun simctl launch  <UDID> com.anilgoktepe.wordswipe
```

Çalıştırdığın binary'nin gerçekten yeni build olduğunu doğrula — bu bir kez yanlış teşhise yol açtı:

```bash
xcrun simctl get_app_container <UDID> com.anilgoktepe.wordswipe
shasum -a 256 <çıkan yol>/WordSwipengilizceren
```

### Teşhis disiplini

- Uygulama binary'sinde `nm` ile sembol aramak **güvenilir bir linkleme kanıtı değildir** — binary stripped; çalıştığı kesin olan pod'lar da sıfır sembol gösterir.
- Ayırt edici kanıt kullan: şüpheli pod'u çalıştığı bilinen bir pod'la karşılaştır, `OTHER_LDFLAGS`'e bak, `xcodebuild` loglarını ve `simctl spawn ... log stream` çıktısını oku.
- Aynı rebuild semptomu değiştirmiyorsa tekrar derleme — varsayımını sorgula.

---

## 5. Test paketleri

```bash
npx tsc --noEmit        # tip kontrolü
npm run test:quiz       # quiz soru üretimi
npm run test:srs        # SRS reducer
npm run test:grammar    # cümle analizi  (10 "known limit" normaldir)
npm run validate:vocab  # kelime veri seti
```

**Temel ilke: testler gerçek üretim fonksiyonunu import etmeli.** Kopyalanan algoritma zamanla sapar; test geçerken uygulama bozulabilir.

Referans desen: `generateQuiz`, `src/utils/quizGenerator.ts` içinde `react-native` bağımlılığı olmadan durur; hem ekran hem `scripts/quiz-test.ts` aynı fonksiyonu import eder. Test edilecek mantık `react-native` importu arkasında kalmışsa **çıkar**, kopyalama.

Bilinen borç: `scripts/srs-test.ts` hâlâ SRS reducer'ını kopyalıyor, çünkü `AppContext.tsx` AsyncStorage import ediyor.

### CI — `.github/workflows/ci.yml`

Aynı beş komut `main`'e açılan her PR'da ve merge sonrası `main`'in kendisinde GitHub Actions üzerinde koşar. PR'sız feature dalı push'u CI almaz — merge adayı değildir.

| Tasarım kararı | Gerekçe |
|---|---|
| `permissions: contents: read`, secret yok | Üç test scriptinde `process.env`, `fetch` veya API anahtarı yok — ölçüldü. CI'ın hiçbir sırra ihtiyacı yok |
| `ubuntu-latest` | Beş komutun hiçbiri macOS/Xcode gerektirmiyor; macOS runner ~10x pahalı |
| `node-version: '22'` | Repo'da sürüm pini yok (`.nvmrc`/`engines` yok). 22 aktif LTS |
| `npm ci` | `package-lock.json` v3 ve `package.json` ile senkron — doğrulandı |
| Action'lar SHA'ya sabitli | Tag taşınmasına karşı; `actions/checkout` ve `actions/setup-node` v7 |
| Her test adımında `!cancelled() && steps.install.outcome == 'success'` | Bir paket patlasa bile beşi de rapor eder; iş yine kırmızı olur. İptal edilen koşuda durur (`always()` beşini boşa koşturuyordu) ve `npm ci` düşerse atlanır — aksi hâlde beş paket `node_modules` olmadan koşuyor, `npx tsc` de sabitlenmemiş TypeScript'i registry'den çekiyordu |
| `push: branches: [main]` | Merge sonrası `main` doğrulanır. Eski `branches-ignore: [main]` bootstrap içindi; `pull_request` ile birlikte aynı commit'e **aynı adı taşıyan iki check-run** üretiyordu ve zorunlu check ada göre en sonkini aldığı için hangi koşunun kapıyı geçtiği deterministik değildi |
| `test:quiz` zorunlu | Geçici varlık koruması **kaldırıldı** (#1 `test:quiz`'i `main`'e getirdi). Adım doğrudan `npm run test:quiz` koşar: eksik veya başarısız script işi kırmızı yapar. Script yeniden adlandırılırsa CI sessizce yeşil kalmaz — `npm run <yok>` EXIT 1 verir, ölçüldü |
| Job adı `Types and test suites` | Ruleset'teki zorunlu status check'in **tam adı**. Job'ı yeniden adlandırmak kapıyı sessizce koparır; ikisi aynı değişiklikte güncellenmeli |

Push öncesi yerel doğrulama — CI'ın yapacağının aynısı:
```bash
npm ci --dry-run && npx tsc --noEmit && npm run test:quiz \
  && npm run test:srs && npm run test:grammar && npm run validate:vocab
```

---

## 6. Teslimat

1. Her iş **ayrı dalda**: `fix/...`, `feat/...`, `chore/...`
2. Commit öncesi: `git status` ile ne eklendiğini gözden geçir; şüpheli dosyanın içeriğini kontrol et
3. Testler geçmeden commit etme
4. Dalı push et, PR aç
5. **`main`'e otomatik merge yok** — merge kararı kullanıcıya aittir

Commit mesajı *neden*i anlatır, *ne*yi değil. Sonuna:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 7. Dürüstlük kuralları

Bu sistem güvenilirliğini raporların doğruluğundan alır:

- Çalıştırılmamış test **asla** geçmiş gibi raporlanmaz
- Her iddia somut kanıtla gelir: dosya yolu, satır numarası, gerçek komut çıktısı
- **Doğrulanan** ile **şüphelenilen** ayrı etiketlenir
- Tamamlanamayan iş, nedeniyle birlikte açıkça bildirilir
- Kapsam kısıtlandıysa (ilk N, örnekleme) bu söylenir — sessiz kısaltma "hepsi tarandı" gibi okunur

---

## 8. Mevcut durum (2026-11-28)

| | |
|---|---|
| PR #2 | `chore/agent-infrastructure` — ajan altyapısı + CI, **merge edildi** (`0d7e302`) |
| PR #1 | `fix/quiz-duplicate-translations` — Quiz mükerrer çeviri düzeltmesi, **merge edildi** (`ff3068a`) |
| `main` | Beş ajan tanımı, `ci.yml` ve quiz düzeltmesi artık `main`'de |
| Testler (`main`) | tsc temiz · quiz 16/16 · SRS 57/57 · gramer 227 toplam / 217 pass / 0 fail / 10 known limit · kelime 1000 temiz |
| `main` koruması | Ruleset **WordSwipe - Main Protection** aktif: zorunlu check `Types and test suites`, 0 onay, force push ve dal silme kapalı, bypass yok |
| Simulator | iPhone 17, iOS 26.3 — `com.anilgoktepe.wordswipe` çalışır durumda |
| Computer Use | Bu ortamda **mevcut değil** |

### Otomasyon olgunluğu

| Yetenek | Durum |
|---|---|
| Uzman ajan çağırma | **Hazır** — beşi de kayıtlı, çağrıldı |
| Otomatik testler | **Hazır** — 5 paket, tek komutla |
| iOS derleme | **Hazır ama kırılgan** — `xcodebuild` yolu çalışıyor, Podfile yaması kalıcı değil |
| iOS QA (Mobile MCP) | **Hazır ve kullanıldı** — 2026-11-27'de `mobile-qa` Quiz ekranının tam fonksiyonel QA'sini yaptı: 11 soru, mükerrer seçenek yok, XP/SRS ayrışması doğru, crash 0. Not: uygulamanın a11y hiyerarşisi butonları yayınlamıyor, seçenek metinleri screenshot'tan okundu — `testID` eklemek otomasyonu kolaylaştırır |
| Bağımsız kod incelemesi | **Hazır** — gerçek bulgular üretti |
| GitHub PR | **Hazır** — `gh` 2.105.0 kurulu ve yetkili (`repo`, `workflow` scope'ları dahil); PR açma/güncelleme/koşu okuma otomatik |
| GitHub Actions CI | **Çalışıyor** — `.github/workflows/ci.yml`; beş paket `main`'e açılan her PR'da ve merge sonrası `main`'de koşar. `a023ff9` üzerinde quiz suite'i ilk kez gerçek CI'da koştu: 16/16 |
| Computer Use | **Yok** — bu ortamda hiçbir desktop kontrol aracı mevcut değil |

### Açık konular

- **`scripts/srs-test.ts` kopyası üretimden sapmış.** Doğru-cevap yolunda `seenCount` güncellemesi eksik (`AppContext.tsx` → `MARK_WORD_LEARNED` onu artırıyor). Bu alanı bozan bir regresyon 57 testin tamamını yeşil bırakır. Düzeltmesi SRS reducer'ına dokunur → onay gerekir.
- `ios/Podfile` deployment-target yaması kalıcı değil — `ios/` gitignore'da ve prebuild ile silinir. Kalıcı çözüm: Expo config plugin. Prebuild öncesi Podfile `ios/` dışına kopyalanmalı.
- Eski `com.wordswipe.app` kurulumu simulator'da duruyor; içinde eski AsyncStorage verisi olabilir. **Onaysız silinmemeli.** (Not: bu id hâlâ `app.json`'da Android paket adı olarak canlı — iOS tarafında kullanılmıyor.)
- **`QuizScreen.tsx:155` — `ADD_XP`, `isFirstAttempt` guard'ının dışında.** Yanlış-sonra-doğru cevap tam baz XP alıyor, ama doğru biçimde "öğrenildi" sayılmıyor. 2026-11-27 simulator koşusunda aritmetikle doğrulandı: gözlenen +56 = 10×5 baz + 6 seri bonusu; ilk denemede doğru 9 cevap 51 verirdi. PR #1'in getirdiği bir regresyon **değil** — o PR XP/SRS mantığına dokunmadı. Düzeltmesi XP davranışını değiştirir, onay gerekir.
- **`main` push tetikleyicisi pratikte henüz doğrulanmadı.** `push: branches: [main]` ilk kez bu dalla geliyor; tanım gereği yalnızca `main`'e merge olduğunda ateşlenir. Gerçek doğrulaması bu PR merge edildikten sonra yapılabilir.
- `concurrency.cancel-in-progress: true` bilerek korundu. Yeni `push: [main]` tetikleyicisi ilk kez `refs/heads/main` grubunu var ediyor: 15 dakika içinde iki ardışık merge olursa ilk `main` koşusu iptal edilir ve o commit yeşil kayıt bırakmaz. Tek geliştiricili projede pratikte görülmez; gerekirse tek satır çözümü var (`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`). PR koşuları ile `main` koşuları farklı gruplarda, birbirini iptal etmiyor.
- `npm ci` 47 güvenlik açığı bildiriyor (2 kritik). CI'ı etkilemiyor (sır yok, yalnızca test koşuyor) ama ayrı bir iş olarak takip edilmeli.
