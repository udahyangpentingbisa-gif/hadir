# Hadir — Absensi & Penggajian

Aplikasi full-stack Next.js untuk absensi harian dan penggajian dengan siklus maksimal 15 hari kehadiran.

## Teknologi

- Next.js App Router, TypeScript, Tailwind CSS, Lucide
- PostgreSQL di Neon dengan Prisma ORM
- Sesi JWT bertanda tangan di cookie HTTP-only, password bcrypt
- Role `OWNER` dan `EMPLOYEE`

## Menyiapkan Neon dan menjalankan lokal

Project ini ditautkan ke branch Neon `production` dan mengaktifkan Postgres, Neon Auth, AI Gateway, serta Realtime. Untuk menautkan project lain, instal Neon CLI lalu jalankan `neon init` dan `neon deploy`. Konfigurasi layanan dan daftar origin Realtime ada di `neon.ts`; gunakan `neon deploy --update-existing` bila CLI meminta persetujuan untuk memperbarui pengaturan branch. CLI menyimpan connection string dan service variables di `.env.local`, yang tidak boleh di-commit.

Pastikan `.env.local` juga memiliki `AUTH_SECRET` acak dengan panjang minimal 32 karakter; buat nilainya, misalnya, dengan `openssl rand -base64 32`. Jangan membagikan atau mencetak isi file environment.

```bash
pnpm install
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Script database memuat `.env.local` secara langsung. `DATABASE_URL` adalah URL pooled untuk query aplikasi; `DATABASE_URL_UNPOOLED` adalah URL direct yang digunakan Prisma Migrate. Untuk membuat migration saat mengubah schema, jalankan `pnpm db:migrate -- --name nama_migrasi`, lalu commit folder migration yang dihasilkan. Migration awal ada di `prisma/migrations`; seed membuat akun owner `admin` / `admin123` dan periode aktif pertama secara idempoten. Ganti kredensial default sebelum aplikasi dipakai pengguna.

Buka `http://localhost:3000/login`. Login aplikasi menggunakan sesi JWT HTTP-only yang sudah ada; Neon Auth tetap aktif dan endpoint JWKS-nya diperiksa, tetapi tidak menggantikan provider login aplikasi. Dashboard owner menggunakan Neon Realtime untuk pembaruan absensi langsung. Pemeriksaan AI Gateway hanya membaca katalog model dan tidak menjalankan inferensi berbayar; akun tanpa kredit dapat terhubung tetapi belum memiliki model aktif.

## Deploy ke Vercel

1. Import repository ke Vercel.
2. Atur environment variables berikut di **Project Settings → Environment Variables**: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `NEON_AUTH_JWKS_URL`, `NEON_AI_GATEWAY_BASE_URL`, `NEON_AI_GATEWAY_TOKEN`, `NEON_REALTIME_URL`, dan `NEON_REALTIME_SECRET`. Gunakan nilai yang dihasilkan Neon CLI; jangan gunakan nilai contoh atau mengekspos token server-side.
3. Jika memakai domain deployment sendiri, atur `NEON_APP_ORIGIN` saat menjalankan `neon deploy --update-existing` agar origin tersebut diizinkan untuk Realtime.
4. Jalankan `pnpm db:deploy` terhadap database target sebelum deployment. Build menjalankan `prisma generate`.
5. Jalankan `pnpm db:seed` satu kali terhadap database target bila akun owner dan periode awal belum tersedia.

URL pooled digunakan aplikasi; URL unpooled digunakan Prisma Migrate. AI Gateway memerlukan kredit Neon agar model dapat dipakai.

## Aturan akses dan bisnis

- Middleware mengarahkan sesi terautentikasi ke dashboard berdasarkan role, tanpa mem-proteksi `/login` dari pengguna anonim.
- Semua endpoint tetap memeriksa sesi dan role di server; karyawan hanya dapat mengakses data absensinya sendiri.
- Setiap absensi dicatat untuk tanggal Asia/Jakarta, unik per karyawan per tanggal, dan menambahkan Rp 50.000.
- Absensi menggunakan transaksi serializable serta batas 15 entri per karyawan di periode aktif. Periode baru menutup periode sebelumnya, tanpa menghapus riwayat.
- Pengajuan pinjaman terbuka setelah 10 hari hadir pada periode aktif. Total pinjaman pending dan disetujui per karyawan dibatasi Rp 300.000; owner dapat menyetujui, menolak, dan menandai pinjaman lunas melalui halaman pengelolaan pinjaman. Pencairan dan pengembalian dilakukan di luar aplikasi.
- Dashboard owner dapat mengelola akun karyawan, memulai periode, dan mengekspor rekap gaji CSV.
