"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppHeader({
  name,
  role,
}: {
  name: string;
  role: "OWNER" | "EMPLOYEE";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

  return (
    <header className="sticky top-0 z-20 border-b border-[#e7ece7] bg-[#f7f9f6]/90 backdrop-blur">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#123e2d] font-bold text-white">H</span>
          <div className="text-xl font-semibold tracking-tight">hadir<span className="text-[#15734c]">.</span></div>
          <span className="ml-1 hidden rounded-full bg-[#e7f2eb] px-3 py-1 text-[11px] font-semibold tracking-wide text-[#15734c] sm:inline">
            {role === "OWNER" ? "OWNER" : "KARYAWAN"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-[#718078] sm:block">{name}</span>
          <button
            type="button"
            disabled={loading}
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-[#e1e8e2] bg-white px-3 py-2 text-sm font-medium text-[#45544c] transition hover:bg-[#f2f6f2] disabled:opacity-60"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{loading ? "Keluar..." : "Keluar"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
