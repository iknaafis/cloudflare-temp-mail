# InstaMail - All-in-Cloudflare Temporary Email Generator

InstaMail adalah website generator email sementara (disposable email) kustom yang dideploy 100% di peramban serverless **Cloudflare**. Sistem ini gratis, cepat, aman, dan tanpa biaya server bulanan!

## 🛠️ Tech Stack & Fitur
- **Cloudflare DNS & Email Routing**: Menerima email masuk di domain Anda (`*@domain.com`) dan mengirimkannya ke Worker.
- **Cloudflare Workers**: Backend API sekaligus memproses parsing email mentah.
- **Cloudflare D1**: Database SQL serverless tempat penyimpanan pesan.
- **Cloudflare Pages/Workers Assets**: Menyajikan frontend website premium secara gratis.
- **Riwayat Kotak Masuk**: Riwayat akun disimpan secara lokal (`localStorage`) agar tetap persisten meski di-refresh.
- **Kode QR & Unduhan Email**: Fitur premium untuk memindai email ke HP dan mengunduh konten email sebagai file HTML/teks.
- **Sound Alert**: Membunyikan nada bel notifikasi sintetis saat email masuk menggunakan Web Audio API.

---

## 🚀 Langkah Panduan Deployment ke Cloudflare

### 1. Persiapan Awal
Pastikan Anda memiliki:
1. Akun Cloudflare.
2. Domain kustom yang DNS-nya sudah diarahkan ke Cloudflare (misal: `domainanda.com`).
3. Node.js terinstal di komputer Anda.

### 2. Instalasi Dependency
Buka terminal/PowerShell di direktori proyek ini, kemudian jalankan:
```bash
npm install
```

### 3. Membuat Database D1 di Cloudflare
Jalankan perintah berikut untuk membuat database serverless baru di Cloudflare:
```bash
npx wrangler d1 create temp-mail-db
```
Setelah berhasil, perintah tersebut akan menampilkan informasi konfigurasi seperti berikut:
```toml
[[d1_databases]]
binding = "DB"
database_name = "temp-mail-db"
database_id = "xxxx-xxxx-xxxx-xxxx"
```
Salin bagian `database_id` tersebut, lalu buka file `wrangler.toml` dan perbarui nilai `database_id` yang ada di sana.

### 4. Mengunggah Struktur Tabel (Schema)
Jalankan perintah ini untuk membuat tabel `messages` di database D1 Cloudflare Anda:
```bash
npx wrangler d1 execute temp-mail-db --remote --file=./schema.sql
```

### 5. Mengatur Konfigurasi Variabel Domain
Buka file `wrangler.toml`, lalu sesuaikan variabel `DOMAINS` di bawah blok `[vars]` dengan domain Anda yang terdaftar di Cloudflare.
```toml
[vars]
DOMAINS = "domainanda.com" # Ganti dengan domain Anda
```

### 6. Mendeploy Aplikasi ke Cloudflare
Jalankan perintah berikut untuk mengunggah backend Worker dan frontend static Anda secara langsung ke Cloudflare:
```bash
npm run deploy
```
Setelah proses deploy selesai, Wrangler akan memberikan URL publik Worker Anda, misalnya:
`https://cloudflare-temp-mail.username.workers.dev`

### 7. Konfigurasi Email Routing di Cloudflare (Penting!)
Agar email yang dikirim ke domain Anda masuk ke aplikasi Worker:
1. Buka dashboard Cloudflare Anda di browser -> pilih domain Anda -> masuk ke menu **Email Routing**.
2. Klik **Get Started** atau **Enable Email Routing** (Cloudflare akan meminta Anda memverifikasi MX Records secara otomatis, cukup klik tombol setuju).
3. Setelah aktif, masuk ke tab **Routing Rules**.
4. Di bagian **Catch-all address**, klik **Edit**:
   - Di bagian Action: Pilih **Send to Worker**.
   - Di bagian Destination: Pilih nama Worker Anda (yaitu `cloudflare-temp-mail`).
5. Klik **Save**.

Sekarang, setiap email yang dikirim ke `siapapun@domainanda.com` akan otomatis diarahkan ke Worker Anda, diurai, dan disimpan di database D1!

---

## 💻 Cara Menjalankan Uji Coba Secara Lokal

Untuk menguji coba dan mengembangkan aplikasi di komputer Anda secara lokal:
1. Jalankan database D1 lokal Anda dengan skema:
   ```bash
   npx wrangler d1 execute temp-mail-db --local --file=./schema.sql
   ```
2. Jalankan server lokal Wrangler:
   ```bash
   npm run dev
   ```
3. Server lokal akan berjalan di `http://localhost:8787`.
4. Anda bisa membuka file `public/index.html` di browser Anda (atau melalui server HTTP lokal apa saja). Aplikasi web secara otomatis akan terhubung ke port `8787` Wrangler lokal Anda.

---

## 🧹 Pembersihan Database Otomatis (Garbage Collection)
Secara bawaan, skrip Worker akan secara otomatis menghapus email lama yang berusia lebih dari 24 jam setiap kali ada email baru masuk. Ini menjaga database Anda tetap bersih dan tidak melebihi batas penyimpanan gratis Cloudflare D1 (5 GB).

---
*Dibuat dengan 💜 menggunakan Cloudflare Serverless.*
