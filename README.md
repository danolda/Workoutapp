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
- Sesli uyarılar: 1 dk, 30 sn, 15 sn ve 5-4-3-2-1 geri sayım — **müziği durdurmaz**
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

## Müzik açıkken sesli uyarı ve kilit ekranı

| | Android (Chrome) | iPhone (Safari) |
|---|---|---|
| Önerilen ses türü | 🎙️ Kayıtlı ses | 🎙️ Kayıtlı ses |
| Uygulama açıkken | Uyarıda YouTube Music / Spotify **kısılır**, ses üstte | Uyarı müziğin **üstünde** çalar (iPhone web'e kısma izni vermez) |
| Uygulama arka planda / telefon kilitli | Süre işler, sesli uyarı çalar, müzik kısılır | Apple web uygulamalarını durdurur → **ntfy** ile kilit ekranı uyarısı |
| Kilit ekranı | **Antrenman kartı**: set, tekrar, kalan süre, sıradaki hareket; "Dinlenmeyi bitir" ve "+15 sn" düğmeleri | ntfy bildirimi: 1 dk / 30 sn / bitti (±5 sn) + sıradaki set |

- **Kayıtlı sesler yeniden işlendi:** eski kayıtlar müzikten ~20 dB kısıktı (−23…−38 LUFS); şimdi
  ~−11,5 LUFS, gürültü temizlendi ve sıkıştırıldı. Müzik kısıldığında ses ~16 dB üstte kalır.
- **Android arka plan:** antrenman sırasında uygulama arka plandayken duyulamayacak kadar kısık bir ton
  çalınır; Chrome sayfayı dondurmaz, uyarılar zamanında çalar. Bu ton ses odağı almaz, müziğin durmaz.
- **İlk antrenmanda** kilit ekranı kartı için bildirim izni istenir (Ayarlar'dan da açılabilir).
- **iPhone için ntfy (isteğe bağlı):** Ayarlar → "Kilit ekranı uyarıları (ntfy)" → ücretsiz ntfy uygulamasını
  kur, gösterilen konu adına abone ol. Dinlenmedeyken uygulamadan çıkınca uyarılar ntfy.sh üzerinden
  planlanır; uygulamaya dönünce iptal edilir. Mesajlar rastgele, gizli bir konu adıyla gönderilir.
- Ayarlar'daki **"Sesi test et"** ile müzik çalarken deneyebilirsin.

## MP3 Dosyaları

Bu 4 MP3'ü kendin kaydedip aynı klasöre koy:

| Dosya     | İçerik                            |
|-----------|-----------------------------------|
| 1dk.mp3   | "Bir dakika kaldı"               |
| 30s.mp3   | "Otuz saniye kaldı"              |
| 15s.mp3   | "On beş saniye kaldı"            |
| 5s.mp3    | "Beş, dört, üç, iki, bir"       |

> ⚠️ Her kayıt **5 saniyeden kısa** olmalı. Android Chrome 5 sn'den uzun sesleri "müzik" sayar ve
> Spotify'ı kısmak yerine durdurur. Yeni kayıt yaparsan müziğin üstünde duyulması için yüksek kaydet
> (hedef ≈ −12 LUFS, tepe −1 dB).

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
