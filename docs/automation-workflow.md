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

### `tools` allowlist'i hakkında — ölçülmüş davranış

Frontmatter'daki `tools:` listesi **MCP araçlarını ve `ToolSearch`'ü kapsam dışı bırakıyor.** 2026-11-21'de ölçüldü: `mobile-qa`, `tools: Read, Grep, Glob, Bash` ile çalıştırıldığında yalnızca `Read` ve `Bash` görebildi; her Mobile MCP çağrısı şu hatayla düştü:

> `its MCP server 'mobile-mcp' is connected but does not offer this tool here`

Listeye `ToolSearch` eklemek de çözmedi. Bu yüzden `mobile-qa` tanımında `tools` alanı **bilerek yok** — simulator'a ulaşmanın tek yolu bu. Bedeli, ajanın `Edit`/`Write`'ı da devralması; bu, dosyasındaki açık yasakla dengeleniyor.

**Sonuç: `tools` listesi bir güvenlik duvarı değil, bir niyet beyanıdır.** `Bash` veren her ajan teknik olarak yazabilir/silebilir. Gerçek koruma, ajan dosyalarındaki açık yasaklar ve `CLAUDE.md`'deki onay kapısıdır.

### Ajan tanımları ne zaman yüklenir

`.claude/agents/` **oturum başında** okunur. Dosya eklemek veya değiştirmek çalışan oturumu etkilemez — değişiklik için oturumu yeniden başlat. Bu iki kez ölçüldü.

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
| Dosya okuma/yazma | Read / Edit / Write / Grep / Glob |
| Derleme, test, git | Bash (terminal) |
| iOS ekran kontrolü | **Mobile MCP** (`mcp__mobile-mcp__*`) |
| Başka yolla erişilemeyen GUI | Computer Use — *bu ortamda mevcut değil* |
| GitHub | `git` + GitHub REST API (`gh` CLI kurulu değil) |

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

## 8. Mevcut durum (2026-11-21)

| | |
|---|---|
| PR #1 | `fix/quiz-duplicate-translations` — Quiz mükerrer çeviri düzeltmesi, **açık**, merge edilmedi |
| Bu dal | `chore/agent-infrastructure` — ajan altyapısı |
| Testler | tsc temiz · quiz 16/16 · SRS 57/57 · gramer 227/227 (10 known limit) · kelime 1000 temiz |
| Simulator | iPhone 17, iOS 26.3 — `com.anilgoktepe.wordswipe` çalışır durumda |
| Computer Use | Bu ortamda **mevcut değil** |

### Otomasyon olgunluğu

| Yetenek | Durum |
|---|---|
| Uzman ajan çağırma | **Hazır** — beşi de kayıtlı, çağrıldı |
| Otomatik testler | **Hazır** — 5 paket, tek komutla |
| iOS derleme | **Hazır ama kırılgan** — `xcodebuild` yolu çalışıyor, Podfile yaması kalıcı değil |
| iOS QA (Mobile MCP) | **Koşullu** — ana oturumdan çalışır; `mobile-qa` alt-ajanından `tools` kaldırıldıktan sonra yeniden test edilmeli |
| Bağımsız kod incelemesi | **Hazır** — gerçek bulgular üretti |
| GitHub PR | **Tek adım kaldı** — `gh` kurulu; kullanıcı bir kez `gh auth login` çalıştırınca tam otomatik |
| GitHub Actions CI | **Yok** — `.github/workflows/` mevcut değil; testler yalnızca yerelde |
| Computer Use | **Yok** — bu ortamda hiçbir desktop kontrol aracı mevcut değil |

### Açık konular

- **`scripts/srs-test.ts` kopyası üretimden sapmış.** Doğru-cevap yolunda `seenCount` güncellemesi eksik (`AppContext.tsx` → `MARK_WORD_LEARNED` onu artırıyor). Bu alanı bozan bir regresyon 57 testin tamamını yeşil bırakır. Düzeltmesi SRS reducer'ına dokunur → onay gerekir.
- `ios/Podfile` deployment-target yaması kalıcı değil — `ios/` gitignore'da ve prebuild ile silinir. Kalıcı çözüm: Expo config plugin. Prebuild öncesi Podfile `ios/` dışına kopyalanmalı.
- Eski `com.wordswipe.app` kurulumu simulator'da duruyor; içinde eski AsyncStorage verisi olabilir. **Onaysız silinmemeli.** (Not: bu id hâlâ `app.json`'da Android paket adı olarak canlı — iOS tarafında kullanılmıyor.)
- CI yok: testler commit/PR'da otomatik koşmuyor.
