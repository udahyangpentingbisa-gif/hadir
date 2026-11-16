"use client";

import { KeyRound, LogOut, Shield, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader({
  name,
  role,
}: {
  name: string;
  role: "OWNER" | "EMPLOYEE";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== form.get("confirmPassword")) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await fetch("/api/owner/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPasswordError(result.error ?? "Kata sandi gagal diubah.");
        return;
      }
      formElement.reset();
      setPasswordNotice("Kata sandi berhasil diubah.");
    } catch {
      setPasswordError("Tidak dapat terhubung ke server. Silakan coba lagi.");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#e7ece7] bg-[#f7f9f6]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:h-[76px] sm:px-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#123e2d] text-white sm:h-10 sm:w-10"><Shield size={19} /></span>
          <div className="text-lg font-semibold tracking-tight sm:text-xl">hadir<span className="text-[#15734c]">.</span></div>
          <span className="ml-1 hidden rounded-full bg-[#e7f2eb] px-3 py-1 text-[11px] font-semibold tracking-wide text-[#15734c] sm:inline">
            {role === "OWNER" ? "OWNER" : "KARYAWAN"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="hidden text-sm font-medium text-[#718078] sm:block">{name}</span>
          <ThemeToggle />
          {role === "OWNER" && (
            <button
              type="button"
              onClick={() => {
                setPasswordDialog(true);
                setPasswordError("");
                setPasswordNotice("");
              }}
              className="flex items-center gap-2 rounded-xl border border-[#e1e8e2] bg-white px-2.5 py-2 text-xs font-medium text-[#45544c] transition hover:bg-[#f2f6f2] sm:px-3 sm:text-sm"
            >
              <KeyRound size={16} />
              <span className="hidden sm:inline">Ubah password</span>
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-[#e1e8e2] bg-white px-2.5 py-2 text-xs font-medium text-[#45544c] transition hover:bg-[#f2f6f2] disabled:opacity-60 sm:px-3 sm:text-sm"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{loading ? "Keluar..." : "Keluar"}</span>
          </button>
        </div>
      </div>
      {passwordDialog && role === "OWNER" && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPasswordDialog(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-dialog-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-[#15734c]">KEAMANAN AKUN</p>
                <h2 id="password-dialog-title" className="mt-2 text-xl font-semibold">Ubah password admin</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup"
                onClick={() => setPasswordDialog(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-[#718078] hover:bg-[#f2f6f2]"
              >
                <X size={18} />
              </button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={changePassword}>
              <PasswordField label="Password saat ini" name="currentPassword" autoComplete="current-password" />
              <PasswordField label="Password baru" name="newPassword" autoComplete="new-password" />
              <PasswordField label="Konfirmasi password baru" name="confirmPassword" autoComplete="new-password" />
              <p className="text-xs text-[#718078]">Password baru minimal 8 karakter.</p>
              {passwordError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{passwordError}</p>}
              {passwordNotice && <p role="status" className="rounded-xl bg-[#eff7f1] px-4 py-3 text-sm text-[#15734c]">{passwordNotice}</p>}
              <button
                disabled={passwordLoading}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-[#15734c] px-4 text-sm font-semibold text-white transition hover:bg-[#105d3d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordLoading ? "Menyimpan..." : "Simpan password baru"}
              </button>
            </form>
          </section>
        </div>
      )}
    </header>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#31443a]">{label}</span>
      <input
        required
        minLength={name === "currentPassword" ? undefined : 8}
        maxLength={128}
        name={name}
        type="password"
        autoComplete={autoComplete}
        className="h-11 w-full rounded-xl border border-[#e1e8e2] bg-white px-4 text-sm outline-none transition focus:border-[#15734c] focus:ring-4 focus:ring-[#15734c]/10"
      />
    </label>
  );
}
