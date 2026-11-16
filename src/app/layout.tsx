import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hadir — Absensi & Penggajian",
  description: "Sistem absensi dan penggajian dengan siklus 15 kehadiran per karyawan.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(localStorage.getItem("hadir-theme")==="dark")document.documentElement.dataset.theme="dark"',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
