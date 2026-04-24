# Grammar Live Bug Log — Sentence Builder

Gerçek kullanıcı testlerinden veya manuel denemelerden çıkan grammar engine hatalarını
burada kayıt altına al.

Her kayıt ileride bir stress test case'e dönüştürülebilir.

---

## Doldurma kuralları

| Alan | Ne yaz |
|---|---|
| **kelime** | Target word (öğrenilen kelime) |
| **cümle** | Kullanıcının yazdığı cümle (aynen) |
| **sistem sonucu** | `perfect` / `fail` |
| **xp** | `verildi` / `verilmedi` |
| **correction** | Sistemin gösterdiği correction (yoksa `—`) |
| **beklenen** | Doğru davranış ne olmalıydı (`perfect` / `fail`) |
| **hata tipi** | Bkz. aşağıdaki liste |
| **local-rule adayı** | `evet` / `hayır` / `belirsiz` |
| **known limit** | `evet` / `hayır` |
| **not** | Ek bağlam, olası fix yönü |

### Hata tipi kısa kodları

| Kod | Açıklama |
|---|---|
| `fn` | False negative — bozuk cümle perfect aldı |
| `fp` | False positive — doğru cümle fail aldı |
| `unsafe-cor` | Yanlış/bozuk correction gösterildi |
| `wrong-diag` | Verdict doğru ama feedback yanlış aileye gitti |
| `wrong-pos` | Kelime yanlış part-of-speech'te kullanılmış |
| `multi-error` | Birden fazla yapısal hata var, correction güvenilmez |
| `other` | Diğer |

---

## Stress test'e dönüştürme kuralları

Bir kaydı `scripts/grammar-stress-test.ts` dosyasına eklemeden önce şu soruları sor:

1. **Verdict net mi?**  
   Hangi durumda `perfect`, hangisinde `fail` bekleniyor — kesin olarak belirtilmeli.

2. **`expectNoCorrection` gerekli mi?**  
   `unsafe-cor` veya `multi-error` tipi hatalarda correction beklenmemeli → `expectNoCorrection: true` ekle.

3. **`knownLimit` mı?**  
   Lokal engine'in yapısal sınırına mı dayanıyor (wh-inversion, full NLP, POS tagger gerektiriyor)?  
   → `knownLimit: true` ekle, push'u bloklamaz ama raporda görünür.

4. **ID seçimi:**  
   Mevcut en yüksek ID'ye +1 ekle.

5. **Kategori adı:**  
   Mevcut kategorilerden birini kullan veya yeni kategori aç.  
   Mevcut kategoriler: `be+bare`, `have+base`, `do+ed`, `do+irregular`, `double-aux`,
   `adj-verb-aux`, `no-finite-verb`, `sv-agreement`, `wrong-prep`, `gerund-infinitive`,
   `article`, `uncountable-plural`, `stative-progressive`, `target-word-family`,
   `malformed-clause`, `correct-simple`, `correct-borderline`, `false-positive-guard`,
   `double-comparative`, `modal-form`, `function-word-typo`, `edge-case`,
   `neg-aux-to`, `neg-do-past`, `imperative-valid`, `gerund-fragment`, `be-wrong-form`,
   `have-base`, `do-misuse`, `passive-valid`, `passive-misuse`, `question-valid`,
   `question-malformed`, `negative-valid`, `negative-malformed`, `target-structural-wrong`,
   `multi-error`, `correct-new-targets`, `wrong-pos`

### Şablon (kopyala-yapıştır)

```typescript
{
  id: XXX, category: 'CATEGORY',
  targetWord: 'WORD', sentence: 'SENTENCE HERE.',
  expectedStatus: 'fail',   // veya 'perfect'
  shouldAwardXp: false,     // veya true
  expectNoCorrection: true, // sadece correction beklenmiyorsa
  knownLimit: true,         // sadece known limit ise
  note: 'Açıklama buraya.',
},
```

---

## Workflow

```
1. Canlı test sırasında beklenmedik davranış gör
         ↓
2. Aşağıdaki tabloya kayıt ekle
   (hata tipi + local-rule adayı mı + known limit mi)
         ↓
3. Local-rule adayıysa:
   scripts/grammar-stress-test.ts dosyasına test case ekle
   (yukarıdaki şablonu kullan)
         ↓
4. npm run test:grammar çalıştır
   → FN / FP / unsafe correction raporu al
         ↓
5. Fix varsa sentenceAnalysisService.ts içinde yap
   → tekrar test çalıştır
         ↓
6. git push
   → pre-push hook otomatik olarak grammar testini çalıştırır
   → regression varsa push bloklansın
```

> **Not:** pre-push hook yalnızca şu dosyalar değiştiğinde testi çalıştırır:
> `sentenceAnalysisService.ts`, `SentenceBuilderScreen.tsx`,
> `normalizeDetailedAnalysisResult.ts`, `detailedAnalysisService.ts`,
> `sentenceAnalysisPrompt.ts`, `detailedAnalysisPrompt.ts`,
> `scripts/grammar-stress-test.ts`

---

## Kayıtlar

<!-- Yeni kayıt eklerken en üste ekle (en yeni en üstte) -->

---

### [BUG-005] · 2026-04-17

| Alan | Değer |
|---|---|
| **kelime** | support |
| **cümle** | He has supported about the issue |
| **sistem sonucu** | perfect |
| **xp** | verildi |
| **correction** | He has supported about the issue. (aynı cümle) |
| **beklenen** | fail |
| **hata tipi** | `fn` |
| **local-rule adayı** | evet |
| **known limit** | hayır |
| **not** | "support" WRONG_PREP_RULES'da yoktu. Eklendi: `support(s\|ed\|ing)? about` pattern. Ayrıca Pattern B (Rule 3) "This is about support…" için yanlış ateşleniyordu (be-verb subject phrase'de); guard eklendi. "talked" finite verb olarak algılanmıyordu; "talk" THIRD_PERSON_VERBS'e eklendi. Stress test case [176] olarak eklendi. |

---

### [BUG-004] · 2026-04-16

| Alan | Değer |
|---|---|
| **kelime** | describe |
| **cümle** | She is describe her expeirence |
| **sistem sonucu** | fail |
| **xp** | verilmedi |
| **correction** | — |
| **beklenen** | fail |
| **hata tipi** | `multi-error` + `wrong-diag` |
| **local-rule adayı** | hayır |
| **known limit** | hayır |
| **not** | Verdict doğru. Typo ("expeirence") + be+bare verb. Correction suppressed — doğru. Eski engine versiyonunda unsafe correction üretiyordu; şu an düzeltilmiş. |

---

### [BUG-003] · 2026-04-16

| Alan | Değer |
|---|---|
| **kelime** | describe |
| **cümle** | A clear describe of the system architecture |
| **sistem sonucu** | fail |
| **xp** | verilmedi |
| **correction** | — |
| **beklenen** | fail |
| **hata tipi** | `wrong-pos` + `wrong-diag` |
| **local-rule adayı** | kısmen |
| **known limit** | hayır |
| **not** | Verdict doğru. Eski davranış: Rule 3 Pattern B "describes" correction üretiyordu — yanıltıcı. Düzeltildi: verb+of suppression eklendi. Stress test case [172] olarak eklendi. |

---

### [BUG-002] · 2026-04-16

| Alan | Değer |
|---|---|
| **kelime** | decision |
| **cümle** | I have to decision this problem |
| **sistem sonucu** | fail |
| **xp** | verilmedi |
| **correction** | — |
| **beklenen** | fail |
| **hata tipi** | `wrong-pos` + `wrong-diag` |
| **local-rule adayı** | hayır |
| **known limit** | hayır |
| **not** | Verdict doğru. Eski feedback: "have/has/had sonrasında fiil yalın hâlde kullanılamaz" — yanlış aile, "decision" fiil değil. Düzeltildi: non-verb token tespiti + nötr feedback. Stress test case [171] olarak eklendi. |

---

### [BUG-001] · 2026-04-16

| Alan | Değer |
|---|---|
| **kelime** | describe |
| **cümle** | I didn't to describe it |
| **sistem sonucu** | fail |
| **xp** | verilmedi |
| **correction** | I didn't describe it. |
| **beklenen** | fail |
| **hata tipi** | `wrong-diag` |
| **local-rule adayı** | evet |
| **known limit** | hayır |
| **not** | Verdict doğru. Eski davranışta feedback yanlış aileye gidiyordu. Düzeltildi: neg-aux + to kuralı Rule 1'e eklendi, özel feedback üretiyor. |
