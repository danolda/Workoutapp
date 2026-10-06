# Workout Tracker PWA

## Kurulum

1. Tüm dosyaları GitHub repo'na yükle
2. GitHub → Settings → Pages → Deploy from branch → main
3. Telefondan siteyi aç → "Ana Ekrana Ekle" / "Install" butonuna bas
4. App gibi kullan!

## Özellikler

- **4 antrenman günü** (dinlenme/off günleri listede yok)
- Üst barda **toplam set sayacı** (ör. `Toplam Set 5 / 17`)
- Her egzersiz için **animasyonlu hareket görseli**; çalışan kas bölgesi yeşil gösterilir (`figures.js`)
- Önceki rekor takibi, antrenman sonunda set / tekrar / rekor özeti
- Dinlenme sayacı **bitiş zamanına göre** hesaplanır: uygulama arka plana atılsa, telefon kilitlense
  ya da uygulama kapanıp açılsa bile süre doğru devam eder; dinlenme bittiyse sıradaki sete geçilir
- Sesli uyarılar: 1 dk, 30 sn, 15 sn ve 5-4-3-2-1 geri sayım — **Spotify'ı durdurmaz**
- ⚙️ Ayarlar: ses türü (telefon sesi / kayıtlı ses), ses testi, kilit ekranı bildirimi, ekranı açık tutma,
  verileri yedekle / geri yükle

## Kişisel Takip (📈 İlerleme)

- Her hareket için **set başı max tekrar** ve **toplam tekrar** telefonda (localStorage) saklanır
- Harekete dokununca tarihe göre **eğri grafik** (Max / set veya seans toplamı; 30 gün / 90 gün / tümü)
  ve tüm seansların **tablosu** açılır (★ = rekor)
- Aynı hareket farklı günlerde olsa da (ör. Dips 1. ve 3. gün) tek hareket olarak toplanır

## Seviye ve Avatar (👤 Profil)

| | |
|---|---|
| Üst vücut günü | **450 XP** |
| Alt vücut günü | **550 XP** |
| Yarım bırakılan antrenman | Yapılan set oranında XP (ör. 17 setin 2'si → 53 XP) |
| Seviye 1 | 200 XP |
| Her seviye | bir öncekinden ~12 XP daha fazla ister |
| Seviye 100 | toplam **80.000 XP** = yarı yarıya üst/alt ile **160 antrenman** |

Formül: `n. seviye için toplam XP = 200·n + round(200·n·(n−1) / 33)`

Her 10 seviyede avatar daha kaslı bir forma geçer (11 form: Çaylak → Yenilmez). Profilde avatar kartı
parmakla eğilebilen 3D bir kart olarak görünür; tüm formlar "Avatar Koleksiyonu"nda listelenir.

## Arka planda sesli uyarı (müzik açıkken)

| | Android (Chrome) | iPhone (Safari) |
|---|---|---|
| Önerilen ses türü | 🎙️ Kayıtlı ses | 🗣️ Telefon sesi |
| Spotify | Uyarı sırasında **kısılır**, durmaz | Uyarı sırasında **kısılır**, durmaz |
| Uygulama arka planda | Süre işler, sesli uyarı verir | Apple web uygulamalarını duraklatır |
| Kilit ekranı | Bildirim izni verilirse "30 saniye kaldı" bildirimi | Ekran açık kalır (otomatik) |

- **Android:** Uygulama arka plandayken de sayar ve uyarıyı çalar. Bildirim izni verirsen
  (Ayarlar → Kilit ekranı bildirimi) uyarılar kilit ekranında da görünür; pil tasarrufu uygulamayı
  dondurursa bildirimi service worker yedek olarak gönderir.
- **iPhone:** Apple, ana ekrana eklenen web uygulamalarının arka planda kod çalıştırmasına izin vermiyor.
  Bu yüzden antrenman sırasında ekran açık tutulur. Telefonu kilitlersen geri döndüğünde süre doğru
  yerden devam eder ama kilitliyken sesli uyarı gelmez.
- Ayarlar'daki **"Sesi test et"** butonuyla Spotify çalarken nasıl davrandığını deneyebilirsin.

## MP3 Dosyaları

Bu 4 MP3'ü kendin kaydedip aynı klasöre koy:

| Dosya     | İçerik                            |
|-----------|-----------------------------------|
| 1dk.mp3   | "Bir dakika kaldı"               |
| 30s.mp3   | "Otuz saniye kaldı"              |
| 15s.mp3   | "On beş saniye kaldı"            |
| 5s.mp3    | "Beş, dört, üç, iki, bir"       |

> ⚠️ Her kayıt **5 saniyeden kısa** olmalı. Android Chrome 5 sn'den uzun sesleri "müzik" sayar ve
> Spotify'ı kısmak yerine durdurur.

## Dosya Yapısı

```
📁 repo/
├── index.html      ← Ana uygulama
├── figures.js      ← Egzersiz animasyonları (SVG)
├── tracker.js      ← Geçmiş, istatistik, XP / seviye hesabı
├── charts.js       ← İlerleme grafikleri (SVG)
├── avatar.js       ← Seviyeye göre gelişen avatar (SVG)
├── manifest.json   ← PWA ayarları
├── sw.js           ← Service Worker (offline + arka plan bildirimleri)
├── icon-192.png    ← Uygulama ikonu
├── icon-512.png    ← Uygulama ikonu
├── 1dk.mp3         ← Kendin kaydet
├── 30s.mp3         ← Kendin kaydet
├── 15s.mp3         ← Kendin kaydet
└── 5s.mp3          ← Kendin kaydet
```

Güncelleme yaptıktan sonra uygulamayı bir-iki kez kapatıp açman yeterli; yeni sürüm otomatik yüklenir.
