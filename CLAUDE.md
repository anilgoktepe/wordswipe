# WordSwipe – Claude Working Rules

## Scope
Sadece bu repo içinde çalış.
Alakasız klasörlere, eski proje kopyalarına, Flashcard klasörlerine, Drive kopyalarına veya dış projelere dokunma.

## Product Overview
WordSwipe bir İngilizce kelime öğrenme uygulamasıdır.

Temel kullanıcı akışı:
1. Kullanıcı önce seviyesini seçer
2. Sonra öğrenmek istediği kelime sayısını seçer
3. Ders başlar
4. Önce seçilen kelime sayısı kadar kelime flashcard olarak gösterilir
5. Sonra bu kelimeler quiz/test olarak sorulur
6. Doğru ve yanlış sonuçlara göre kelimeler kelime havuzunda ayrışır
7. Doğru bilinen kelimeler ve zorlanılan kelimeler ayrı takip edilir
8. Kullanıcı daha sonra öğrendiği kelimelerle Sentence Builder içinde cümle kurar
9. Bu cümle AI + LanguageTool ile analiz edilir
10. Sonuç olarak verdict, feedback, correction/example, XP ve ilerleme etkileri belirlenir

## Current Priorities
Şu an aktif öncelikler:

1. **Sentence Builder**
   - sentence evaluation
   - grammar validation
   - target-word validation
   - correction reliability
   - LanguageTool integration
   - verdict / XP / success gating

2. **SRS / Word Progression**
   - word progression logic
   - review scheduling
   - difficult words
   - learned words
   - Sentence Builder → SRS integration

## Hard Constraints
- UI redesign yapma unless explicitly asked
- Alakasız refactor yapma
- Gereksiz dosya taşıma / yeniden adlandırma yapma
- Değişiklikleri minimum ve kontrollü tut
- İstenen feature dışındaki davranışları bozma

## Core Product Rules
- Yanlış correction, hiç correction göstermemekten daha kötüdür
- Yapısal grammar hataları asla success sayılmamalı
- Güvenilmeyen correction gösterilmemeli
- Correction güvenli değilse safe example sentence göster
- AI, local rules veya LanguageTool kaynaklı structural fail’i override edemez
- Target word eksikse veya temelden yanlış kullanılmışsa fail olmalı
- Typo / punctuation ile structural grammar hataları aynı şekilde ele alınmamalı
- Structural grammar errors must not receive XP

## Architecture Direction
Sentence Builder için tercih edilen sıra:
1. local pre-validation
2. LanguageTool layer
3. AI evaluation
4. strict merge layer
5. correction validation gate
6. XP / success / SRS gating

## Source of Truth
Backend mümkün olduğunca şu alanlarda source of truth olsun:
- final verdict
- correction trust
- XP eligibility
- success / fail decision

Frontend ağırlıklı olarak:
- sonucu render etsin
- backend verdict’e göre gating uygulasın
- sadece gerektiğinde hızlı local pre-check yapsın

## Workflow Rules
Kod yazmadan önce:
1. gerçek runtime flow’u incele
2. ilgili dosyaları belirle
3. mevcut davranışı kısa özetle
4. root cause’u açıkla

Kod yazarken:
- hangi dosyaların değiştiğini net söyle
- değişiklikleri odaklı tut
- geniş rewrite yapma

Koddan sonra:
- ne değiştiğini özetle
- neden gerektiğini açıkla
- riskleri yaz
- test case öner

## Quality Standard
Tek tek hack/patch biriktirme.
Mümkünse tekrar kullanılabilir, kategori bazlı ve sürdürülebilir çözüm üret.
Belirsizlik varsa tamam olmuş gibi davranma; açıkça söyle.