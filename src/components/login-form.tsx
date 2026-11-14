"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: form.get("identity"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "Login gagal. Periksa kembali data Anda.");
        return;
      }
      router.replace(result.redirectTo ?? "/login");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Username atau email</span>
        <input
          required
          name="identity"
          autoComplete="username"
          placeholder="Masukkan username atau email"
          className="h-12 w-full rounded-xl border border-[#e1e8e2] bg-white px-4 text-sm outline-none transition focus:border-[#15734c] focus:ring-4 focus:ring-[#15734c]/10"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Kata sandi</span>
        <span className="relative block">
          <input
            required
            minLength={6}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Masukkan kata sandi"
            className="h-12 w-full rounded-xl border border-[#e1e8e2] bg-white px-4 pr-12 text-sm outline-none transition focus:border-[#15734c] focus:ring-4 focus:ring-[#15734c]/10"
          />
          <button
            type="button"
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#718078]"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#15734c] font-semibold text-white transition hover:bg-[#105d3d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <LoaderCircle size={18} className="animate-spin" />}
        {loading ? "Memeriksa akun..." : "Masuk"}
      </button>
    </form>
  );
}
