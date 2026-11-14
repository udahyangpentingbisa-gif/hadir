import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hadir — Absensi & Penggajian",
  description: "Sistem absensi dan penggajian karyawan periode 15 hari.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
