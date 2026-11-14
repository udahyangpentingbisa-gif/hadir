"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, LoaderCircle, X } from "lucide-react";

export type LoanStatus = "PENDING" | "APPROVED" | "REJECTED" | "REPAID";
export type OwnerLoanRow = {
  id: string;
  amount: number;
  status: LoanStatus;
  createdAt: string;
  updatedAt: string;
  employeeName: string;
  username: string;
  periodName: string;
};

export function OwnerLoans({ initialLoans }: { initialLoans: OwnerLoanRow[] }) {
  const [loans, setLoans] = useState(initialLoans);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = loans.filter((loan) => loan.status === "PENDING").length;
  const outstanding = loans
    .filter((loan) => loan.status === "PENDING" || loan.status === "APPROVED")
    .reduce((sum, loan) => sum + loan.amount, 0);

  async function changeStatus(loan: OwnerLoanRow, status: "APPROVED" | "REJECTED" | "REPAID") {
    const confirmation = {
      APPROVED: `Setujui pinjaman ${currency(loan.amount)} untuk ${loan.employeeName}?`,
      REJECTED: `Tolak pengajuan pinjaman ${loan.employeeName}?`,
      REPAID: `Tandai pinjaman ${loan.employeeName} sebesar ${currency(loan.amount)} sebagai lunas?`,
    }[status];
    if (!window.confirm(confirmation)) return;

    setBusyId(loan.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/owner/loans/${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as {
        error?: string;
        loan?: { id: string; status: LoanStatus; updatedAt: string };
      };
      if (!response.ok || !result.loan) {
        throw new Error(result.error ?? "Status pinjaman gagal diperbarui.");
      }

      const updatedLoan = result.loan;
      setLoans((current) =>
        current.map((item) =>
          item.id === loan.id
            ? { ...item, status: updatedLoan.status, updatedAt: updatedLoan.updatedAt }
            : item,
        ),
      );
      setNotice(
        status === "APPROVED"
          ? "Pinjaman disetujui."
          : status === "REJECTED"
            ? "Pengajuan pinjaman ditolak."
            : "Pinjaman ditandai lunas.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status pinjaman gagal diperbarui.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Link href="/dashboard/owner" className="inline-flex items-center gap-2 text-sm font-medium text-[#607168] hover:text-[#15734c]">
        <ArrowLeft size={16} /> Kembali ke dashboard owner
      </Link>
      <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#15734c]">PENGELOLAAN PINJAMAN</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pengajuan pinjaman</h1>
          <p className="mt-2 text-sm text-[#718078]">Setujui atau tolak pengajuan, lalu tandai lunas setelah pengembalian selesai.</p>
        </div>
        <div className="flex gap-3">
          <SummaryCard label="Menunggu persetujuan" value={String(pending)} />
          <SummaryCard label="Total pinjaman aktif" value={currency(outstanding)} />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Persetujuan dan pencairan ditangani owner di luar aplikasi. Tandai lunas setelah pengembalian diterima.
      </div>
      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-[#eff7f1] text-[#15734c]"}`}
        >
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Tutup notifikasi">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 border-b border-[#edf1ed] bg-[#fafcfa] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#89958d]">
          <span>Karyawan</span>
          <span>Nominal</span>
          <span>Status</span>
          <span className="text-right">Tindakan</span>
        </div>
        {loans.map((loan) => (
          <div key={loan.id} className="grid grid-cols-1 gap-3 border-b border-[#edf1ed] px-5 py-4 last:border-b-0 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
            <div>
              <p className="font-semibold">{loan.employeeName}</p>
              <p className="mt-1 text-xs text-[#89958d]">@{loan.username} · {loan.periodName} · {formatDate(loan.createdAt)}</p>
            </div>
            <p className="font-semibold">{currency(loan.amount)}</p>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(loan.status)}`}>
              {statusLabel(loan.status)}
            </span>
            <div className="flex justify-start gap-2 sm:justify-end">
              {loan.status === "PENDING" && (
                <>
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void changeStatus(loan, "APPROVED")}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#15734c] px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === loan.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                    Setujui
                  </button>
                  <button
                    type="button"
                    disabled={busyId === loan.id}
                    onClick={() => void changeStatus(loan, "REJECTED")}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    <X size={14} /> Tolak
                  </button>
                </>
              )}
              {loan.status === "APPROVED" && (
                <button
                  type="button"
                  disabled={busyId === loan.id}
                  onClick={() => void changeStatus(loan, "REPAID")}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#dce6de] px-3 text-xs font-semibold text-[#31443a] disabled:opacity-50"
                >
                  {busyId === loan.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                  Tandai lunas
                </button>
              )}
              {(loan.status === "REJECTED" || loan.status === "REPAID") && (
                <span className="text-xs text-[#89958d]">Tidak ada tindakan</span>
              )}
            </div>
          </div>
        ))}
        {loans.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-[#89958d]">Belum ada pengajuan pinjaman.</p>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e6ece6] bg-white px-4 py-3">
      <p className="text-xs text-[#89958d]">{label}</p>
      <p className="mt-1 font-semibold text-[#123e2d]">{value}</p>
    </div>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: LoanStatus) {
  return {
    PENDING: "Menunggu",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
    REPAID: "Lunas",
  }[status];
}

function statusClass(status: LoanStatus) {
  return {
    PENDING: "bg-amber-50 text-amber-800",
    APPROVED: "bg-emerald-50 text-emerald-800",
    REJECTED: "bg-red-50 text-red-700",
    REPAID: "bg-slate-100 text-slate-700",
  }[status];
}
