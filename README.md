# Hadir — Absensi & Penggajian

Aplikasi full-stack Next.js untuk absensi harian dan penggajian dengan siklus maksimal 15 hari kehadiran.

## Teknologi

- Next.js App Router, TypeScript, Tailwind CSS, Lucide
- PostgreSQL di Neon dengan Prisma ORM
- Sesi JWT bertanda tangan di cookie HTTP-only, password bcrypt
- Role `OWNER` dan `EMPLOYEE`

## Menyiapkan Neon dan menjalankan lokal

Project ini ditautkan ke branch Neon `production` dan mengaktifkan Postgres, Neon Auth, AI Gateway, serta Realtime. Isi `.env.local` dengan connection string dari Neon Console (**Connect**): gunakan pooled connection untuk `DATABASE_URL` dan direct connection untuk `DATABASE_URL_UNPOOLED`. Jangan membagikan atau commit connection string tersebut. Untuk menautkan project lain, instal Neon CLI lalu jalankan `neon init` dan `neon deploy`. Konfigurasi layanan dan daftar origin Realtime ada di `neon.ts`; gunakan `neon deploy --update-existing` bila CLI meminta persetujuan untuk memperbarui pengaturan branch. CLI juga dapat membuat `.env.local` dengan connection string dan service variables.

Untuk Neon Auth, isi `NEON_AUTH_BASE_URL` dengan URL endpoint Auth dari Neon dan `NEON_AUTH_JWKS_URL` dengan URL yang sama ditambah `/.well-known/jwks.json`. Endpoint Auth tidak dapat digunakan sebagai connection string Postgres.

Jika mengatur Realtime dari Console, buka **Postgres database → Realtime**, salin endpoint dan secret branch ke `NEON_REALTIME_URL` dan `NEON_REALTIME_SECRET`. Gunakan URL WebSocket berawalan `wss://` untuk SDK client; jangan membagikan secret atau menaruhnya di bundle browser.

Aplikasi ini memakai Prisma; live query menggunakan `rawSql` dari `@neon/realtime/server`, jadi `drizzleAdapter()` tidak diperlukan.

`.env.local` lokal harus memiliki `AUTH_SECRET` acak minimal 32 karakter (misalnya `openssl rand -base64 32`) dan `ADMIN_INITIAL_PASSWORD` yang kuat, 8 hingga 128 karakter. Seed tidak memakai password default dan hanya menggunakan password awal itu ketika membuat akun `admin` baru; seed tidak mengubah password akun yang sudah ada. Pastikan URL pooled/direct Postgres, endpoint Auth, dan nilai Realtime berasal dari branch Neon yang sama sebelum menjalankan seluruh fitur; jangan membagikan atau mencetak isi file environment.

```bash
pnpm install
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Script database memuat `.env.local` secara langsung. `DATABASE_URL` adalah URL pooled untuk query aplikasi; `DATABASE_URL_UNPOOLED` adalah URL direct yang digunakan Prisma Migrate. Untuk membuat migration saat mengubah schema, jalankan `pnpm db:migrate -- --name nama_migrasi`, lalu commit folder migration yang dihasilkan. Migration awal ada di `prisma/migrations`; seed membuat akun owner `admin` jika belum ada, menggunakan `ADMIN_INITIAL_PASSWORD` yang wajib Anda isi, serta siklus kerja aktif untuk setiap karyawan secara idempoten. Seed tidak mereset password akun yang sudah ada. Setelah masuk, owner dapat mengubah password dari tombol **Ubah password** di header.

Buka `http://localhost:3000/login`. Login aplikasi menggunakan sesi JWT HTTP-only yang sudah ada; Neon Auth tetap aktif dan endpoint JWKS-nya diperiksa, tetapi tidak menggantikan provider login aplikasi. Dashboard owner menggunakan Neon Realtime untuk pembaruan absensi langsung. Pemeriksaan AI Gateway hanya membaca katalog model dan tidak menjalankan inferensi berbayar; akun tanpa kredit dapat terhubung tetapi belum memiliki model aktif.

## Deploy ke Vercel

1. Import repository ke Vercel.
2. Atur environment variables berikut di **Project Settings → Environment Variables**: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `NEON_AUTH_JWKS_URL`, `NEON_AI_GATEWAY_BASE_URL`, `NEON_AI_GATEWAY_TOKEN`, `NEON_REALTIME_URL`, dan `NEON_REALTIME_SECRET`. Gunakan nilai yang dihasilkan Neon CLI; jangan gunakan nilai contoh atau mengekspos token server-side.
3. Jika memakai domain deployment sendiri, atur `NEON_APP_ORIGIN` saat menjalankan `neon deploy --update-existing` agar origin tersebut diizinkan untuk Realtime.
4. Jalankan `pnpm db:deploy` terhadap database target sebelum deployment. Build menjalankan `prisma generate`.
5. Jalankan `pnpm db:seed` satu kali terhadap database target bila akun owner dan siklus awal belum tersedia.

URL pooled digunakan aplikasi; URL unpooled digunakan Prisma Migrate. AI Gateway memerlukan kredit Neon agar model dapat dipakai.

## Aturan akses dan bisnis

- Middleware mengarahkan sesi terautentikasi ke dashboard berdasarkan role, tanpa mem-proteksi `/login` dari pengguna anonim.
- Semua endpoint tetap memeriksa sesi dan role di server; karyawan hanya dapat mengakses data absensinya sendiri.
- Setiap absensi dicatat untuk tanggal Asia/Jakarta, unik per karyawan per tanggal, dan menambahkan Rp 50.000.
- Setiap karyawan memiliki siklus kerja sendiri. Siklus berganti otomatis setelah 15 absensi; riwayat siklus tetap tersimpan.
- Karyawan dapat mengajukan satu cuti/off tanpa upah per siklus, hanya Senin–Kamis. Jumat–Minggu tetap hari kerja. Laporan potong gaji mengurangi gaji siklus sebesar Rp 50.000 saat dikirim tanpa mengubah jumlah kehadiran; potongan dibatalkan jika owner menolak laporan. Gaji tidak pernah kurang dari Rp 0.
- Absensi menggunakan transaksi serializable dan unik per karyawan per tanggal. Hari tanpa absensi tidak menghalangi karyawan untuk absen pada tanggal berikutnya; upah hanya dihitung untuk tanggal yang memiliki catatan absensi.
- Pengajuan pinjaman terbuka setelah 10 hari hadir pada siklus aktif. Total pinjaman pending dan disetujui per karyawan dibatasi Rp 300.000; owner dapat menyetujui, menolak, dan menandai pinjaman lunas melalui halaman pengelolaan pinjaman. Pinjaman yang disetujui mengurangi gaji bersih pada siklus terkait; pengajuan yang menunggu, ditolak, atau sudah lunas tidak dipotong. Pencairan dan pengembalian dilakukan di luar aplikasi.
- Dashboard owner dapat mengelola akun karyawan dan mengedit atau menghapus absensi, laporan ketidakhadiran, serta pinjaman pada semua siklus. Koreksi absensi dapat dipindah tanggal, siklus, dan nominal upahnya; owner dapat menambahkan absensi ke siklus terpilih serta menghapus satu atau semua absensi dalam siklus tersebut. Laporan ketidakhadiran dapat dipindah tanggal/siklus, mengubah jenis, alasan, status, dan potongan. Pinjaman dapat diubah nominal, tanggal, siklus, dan statusnya. Perubahan catatan memperbarui penghitungan gaji berdasarkan data terbaru. Tanggal koreksi dapat berada di masa lampau, hari ini, maupun masa mendatang; bila koreksi pada siklus aktif mencapai 15 absensi, siklus berikutnya dimulai otomatis setelah absensi terakhir.
