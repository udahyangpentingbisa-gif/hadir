"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, LoaderCircle } from "lucide-react";

type LoanStatus = "PENDING" | "APPROVED" | "REJECTED" | "REPAID";
type LoanRow = {
  id: string;
  amount: number;
  status: LoanStatus;
  createdAt: string;
  periodName: string;
};
type LoanResponse = {
  error?: string;
  available?: number;
  loan?: Omit<LoanRow, "periodName">;
};

export function EmployeeLoanPage({
  attendanceDays,
  periodName,
  initialLoans,
  initialOutstanding,
  loanLimit,
}: {
  attendanceDays: number;
  periodName: string;
  initialLoans: LoanRow[];
  initialOutstanding: number;
  loanLimit: number;
}) {
  const [loans, setLoans] = useState(initialLoans);
  const [outstanding, setOutstanding] = useState(initialOutstanding);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const available = Math.max(0, loanLimit - outstanding);

  async function submitLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const result = (await response.json()) as LoanResponse;
      if (!response.ok || !result.loan || typeof result.available !== "number") {
        throw new Error(result.error ?? "Pengajuan pinjaman gagal disimpan.");
      }

      const loan = result.loan;
      setLoans((current) => [
        {
          ...loan,
          periodName,
        },
        ...current,
      ]);
      setOutstanding(loanLimit - result.available);
      setAmount("");
      setNotice("Pengajuan terkirim dan menunggu persetujuan owner.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pengajuan pinjaman gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/dashboard/employee" className="inline-flex items-center gap-2 text-sm font-medium text-[#607168] hover:text-[#15734c]">
        <ArrowLeft size={16} /> Kembali ke dashboard
      </Link>
      <section className="mt-5 rounded-[26px] bg-[#123e2d] p-6 text-white sm:p-9">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#b9f1ce]">
            <Banknote size={23} />
          </span>
          <div>
            <p className="text-sm font-medium text-[#b9f1ce]">FASILITAS KARYAWAN</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pinjaman karyawan</h1>
            <p className="mt-3 text-sm text-white/75">
              {attendanceDays} hari hadir pada {periodName}. Pengajuan dapat dilakukan setelah 10 hari hadir.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#e6ece6] bg-white p-5">
          <p className="text-sm text-[#718078]">Batas total pinjaman aktif</p>
          <p className="mt-2 text-2xl font-semibold text-[#123e2d]">{currency(loanLimit)}</p>
        </article>
        <article className="rounded-2xl border border-[#e6ece6] bg-white p-5">
          <p className="text-sm text-[#718078]">Sisa batas tersedia</p>
          <p className="mt-2 text-2xl font-semibold text-[#123e2d]">{currency(available)}</p>
          <p className="mt-1 text-xs text-[#89958d]">Pengajuan menunggu persetujuan dan pinjaman disetujui dihitung.</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e6ece6] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Ajukan pinjaman</h2>
        <p className="mt-1 text-sm text-[#718078]">Nominal pengajuan tidak dapat melebihi sisa batas pinjaman.</p>
        <form onSubmit={submitLoan} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium">Nominal (Rp)</span>
            <input
              type="number"
              name="amount"
              min={1}
              max={available}
              step={1}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#e1e8e2] px-3 text-sm outline-none focus:border-[#15734c]"
              placeholder="Contoh: 200000"
            />
          </label>
          <button
            type="submit"
            disabled={busy || available < 1}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#15734c] px-5 text-sm font-semibold text-white hover:bg-[#105d3d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {busy ? "Mengirim..." : "Kirim pengajuan"}
          </button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-[#15734c]">{notice}</p>}
        <p className="mt-4 text-xs leading-5 text-[#89958d]">
          Pengajuan perlu disetujui owner. Jika disetujui, nominal pinjaman mengurangi gaji bersih pada siklus ini. Pengembalian mengikuti kesepakatan di luar aplikasi; owner menandai pinjaman lunas setelah pengembalian.
        </p>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white">
        <div className="border-b border-[#edf1ed] px-5 py-4">
          <h2 className="font-semibold">Riwayat pinjaman</h2>
        </div>
        <div className="divide-y divide-[#edf1ed]">
          {loans.map((loan) => (
            <div key={loan.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{currency(loan.amount)}</p>
                <p className="mt-1 text-xs text-[#89958d]">{loan.periodName} · {formatDate(loan.createdAt)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(loan.status)}`}>
                {statusLabel(loan.status)}
              </span>
            </div>
          ))}
          {loans.length === 0 && (
            <p className="px-5 py-9 text-center text-sm text-[#89958d]">Belum ada pengajuan pinjaman.</p>
          )}
        </div>
      </section>
    </>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: LoanStatus) {
  return {
    PENDING: "Menunggu persetujuan",
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
