"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Kesalahan halaman:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <section className="w-full max-w-md rounded-2xl border border-[#e6ece6] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#15734c]">HADIR</p>
        <h1 className="mt-3 text-2xl font-semibold">Halaman mengalami kendala</h1>
        <p className="mt-3 text-sm leading-6 text-[#718078]">
          Muat ulang halaman atau coba lagi beberapa saat. Data akun dan absensi tetap aman.
        </p>
        <button
          onClick={reset}
          className="mt-6 h-11 rounded-xl bg-[#15734c] px-5 text-sm font-semibold text-white hover:bg-[#105d3d]"
        >
          Coba lagi
        </button>
      </section>
    </main>
  );
}
