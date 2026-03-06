# Workout Tracker PWA

## Kurulum

1. Tüm dosyaları GitHub repo'na yükle
2. GitHub → Settings → Pages → Deploy from branch → main
3. Telefondan siteyi aç → "Ana Ekrana Ekle" / "Install" butonuna bas
4. App gibi kullan!

## MP3 Dosyaları

Bu 4 MP3'ü kendin kaydedip aynı klasöre koy:

| Dosya     | İçerik                            |
|-----------|-----------------------------------|
| 1dk.mp3   | "Bir dakika kaldı"               |
| 30s.mp3   | "Otuz saniye kaldı"              |
| 15s.mp3   | "On beş saniye kaldı"            |
| 5s.mp3    | "Beş, dört, üç, iki, bir"       |

## Dosya Yapısı

```
📁 repo/
├── index.html      ← Ana uygulama
├── manifest.json   ← PWA ayarları
├── sw.js           ← Service Worker (offline)
├── icon-192.png    ← Uygulama ikonu
├── icon-512.png    ← Uygulama ikonu
├── 1dk.mp3         ← Kendin kaydet
├── 30s.mp3         ← Kendin kaydet
├── 15s.mp3         ← Kendin kaydet
└── 5s.mp3          ← Kendin kaydet
```
