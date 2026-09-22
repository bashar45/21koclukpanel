# Koçluk Paneli

Koçun WhatsApp kuyruğunu görüp cevap yazdığı panel. Statik SPA; sunucu
tarafı mantık yok, yetkilendirmeyi Supabase RLS ve `is_admin()` yapıyor.

## Çalıştırma

```
npm install
npm run dev
```

## Deploy

Coolify → Dockerfile kaynağı, domain `panel.bilgem.cloud`, port `80`.

## Erişim

Panele girebilmek için iki şey gerekiyor:

1. Supabase Auth'ta bir kullanıcı (Dashboard → Authentication → Users)
2. O kullanıcının `admins` tablosunda kaydı:
   ```sql
   insert into admins (user_id) values ('<auth user id>');
   ```

İkincisi olmadan giriş yapılır ama hiçbir veri görünmez — panel bu durumu
"Yetkiniz yok" ekranıyla açıkça söyler.

## Notlar

- `.env` içindeki publishable anahtar **gizli değildir**, tarayıcıya
  gömülmek üzere tasarlanmıştır ve derlenmiş bundle'da zaten görünür.
  Koruma RLS'te.
- Koç cevabı doğrudan Meta'ya gitmez: `send-reply` fonksiyonu işi outbox'a
  yazar, sonra hemen göndermeyi dener. Ağ hatasında mesaj kaybolmaz.
- 24 saatlik pencere kapalıysa serbest mesaj Meta tarafından reddedilir.
  Panel bunu göndermeden önce uyarı olarak gösterir.
