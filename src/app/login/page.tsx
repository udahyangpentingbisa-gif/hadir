import { Shield } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f5f7f4] px-4 py-6 sm:px-5 sm:py-10">
      <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(27,53,40,0.12)] md:grid-cols-[1.05fr_0.95fr] md:rounded-[30px]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#123e2d] p-12 text-white md:flex">
          <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-4 h-48 w-48 rounded-full border border-white/10" />
          <div className="relative">
            <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#b9f1ce] text-[#123e2d]"><Shield size={20} /></span>
              hadir<span className="text-[#b9f1ce]">.</span>
            </div>
            <div className="mt-24 max-w-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b9f1ce]">Kerja jadi lebih teratur</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-tight">Hadir hari ini, tumbuh setiap hari.</h1>
              <p className="mt-6 text-base leading-7 text-white/70">Absensi dan penggajian yang sederhana, transparan, dan selalu dalam genggaman.</p>
            </div>
          </div>
          <div className="relative flex items-center justify-between border-t border-white/15 pt-5 text-sm text-white/60">
            <span>Absensi · Penggajian · Siklus 15 kehadiran</span>
            <span>01 / 03</span>
          </div>
        </section>
        <section className="flex min-h-0 flex-col justify-center px-5 py-8 sm:px-12 sm:py-12 md:min-h-[620px]">
          <div className="mb-12 md:hidden">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#123e2d] text-white"><Shield size={20} /></span>
              hadir<span className="text-[#15734c]">.</span>
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm">
            <p className="text-sm font-semibold text-[#15734c]">SELAMAT DATANG KEMBALI</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Masuk ke akunmu</h2>
            <p className="mt-3 text-sm leading-6 text-[#718078]">Kelola kehadiran dan informasi gaji dengan aman.</p>
            <div className="mt-9">
              <LoginForm />
            </div>
            <p className="mt-8 text-center text-xs leading-5 text-[#8a968f]">Akses hanya untuk akun karyawan dan owner yang terdaftar.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
