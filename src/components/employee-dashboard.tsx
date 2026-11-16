"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banknote, Check, CircleCheck, Clock3, LoaderCircle, LockKeyhole, Send, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type HistoryItem = { date: string; attendedAt: string; wage: number };
type AbsenceReport = {
  id: string;
  date: string;
  kind: "LEAVE" | "EXPLANATION";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  salaryDeduction: number;
};
type AttendanceResponse = {
  error?: string;
  count?: number;
  wageEarned?: number;
  date?: string;
  attendedAt?: string;
  cycleCompleted?: boolean;
};

export function EmployeeDashboard({
  initialCount,
  initialWage,
  initialAttendedToday,
  initialAbsenceReportedToday,
  initialHistory,
  initialAbsenceReports,
  periodName,
}: {
  initialCount: number;
  initialWage: number;
  initialAttendedToday: boolean;
  initialAbsenceReportedToday: boolean;
  initialHistory: HistoryItem[];
  initialAbsenceReports: AbsenceReport[];
  periodName: string | null;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [wage, setWage] = useState(initialWage);
  const [attendedToday, setAttendedToday] = useState(initialAttendedToday);
  const [absenceReportedToday, setAbsenceReportedToday] = useState(initialAbsenceReportedToday);
  const [history, setHistory] = useState(initialHistory);
  const [absenceReports, setAbsenceReports] = useState(initialAbsenceReports);
  const [absenceDate, setAbsenceDate] = useState("");
  const [absenceKind, setAbsenceKind] = useState<"LEAVE" | "EXPLANATION">("LEAVE");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceBusy, setAbsenceBusy] = useState(false);
  const [absenceError, setAbsenceError] = useState("");
  const [absenceNotice, setAbsenceNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const complete = count >= 15;

  useEffect(() => {
    let activeDate = jakartaDateKey();
    const interval = window.setInterval(() => {
      const currentDate = jakartaDateKey();
      if (currentDate !== activeDate) {
        activeDate = currentDate;
        setAttendedToday(false);
        setAbsenceReportedToday(false);
        setNotice("");
        setError("");
        router.refresh();
      }
    }, 30_000);
    const refreshInterval = window.setInterval(() => router.refresh(), 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(refreshInterval);
    };
  }, [router]);

  useEffect(() => {
    setAbsenceReports(initialAbsenceReports);
  }, [initialAbsenceReports]);

  useEffect(() => {
    setWage(initialWage);
  }, [initialWage]);

  useEffect(() => {
    setAbsenceReportedToday(initialAbsenceReportedToday);
  }, [initialAbsenceReportedToday]);

  async function attend() {
    if (!window.confirm("Catat kehadiran untuk hari ini? Absensi hanya dapat dilakukan satu kali sehari.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/attendance", { method: "POST" });
      const result = (await response.json()) as AttendanceResponse;
      if (!response.ok) throw new Error(result.error ?? "Absensi gagal dicatat.");
      const { count: attendanceCount, wageEarned, date, attendedAt: checkInTime } = result;
      const attendanceDate = new Date(date ?? "");
      const attendedAt = new Date(checkInTime ?? "");
      if (
        typeof attendanceCount !== "number" ||
        !Number.isFinite(attendanceCount) ||
        typeof wageEarned !== "number" ||
        !Number.isFinite(wageEarned) ||
        typeof date !== "string" ||
        typeof checkInTime !== "string" ||
        Number.isNaN(attendanceDate.getTime()) ||
        Number.isNaN(attendedAt.getTime())
      ) {
        throw new Error("Data waktu absensi dari server tidak valid. Muat ulang halaman dan coba lagi.");
      }
      setCount(attendanceCount);
      setWage((current) => current + wageEarned);
      setAttendedToday(true);
      setHistory((items) => [
        {
          date,
          attendedAt: checkInTime,
          wage: wageEarned,
        },
        ...items,
      ].slice(0, 10));
      setNotice("Kehadiran berhasil dicatat. Semangat bekerja!");
      if (result.cycleCompleted) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAbsence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAbsenceBusy(true);
    setAbsenceError("");
    setAbsenceNotice("");
    try {
      const response = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: absenceDate, kind: absenceKind, reason: absenceReason }),
      });
      const result = (await response.json()) as { error?: string; report?: AbsenceReport };
      const report = result.report;
      if (!response.ok || !report) throw new Error(result.error ?? "Laporan ketidakhadiran gagal dikirim.");
      setAbsenceReports((items) => [report, ...items].slice(0, 10));
      setWage((current) => Math.max(0, current - report.salaryDeduction));
      if (absenceDate === jakartaDateKey()) setAbsenceReportedToday(true);
      setAbsenceDate("");
      setAbsenceReason("");
      setAbsenceNotice("Laporan terkirim dan menunggu persetujuan owner.");
      router.refresh();
    } catch (caught) {
      setAbsenceError(caught instanceof Error ? caught.message : "Laporan ketidakhadiran gagal dikirim.");
    } finally {
      setAbsenceBusy(false);
    }
  }

  return (
    <>
      <section className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-[#e6ece6] bg-white p-6 shadow-[0_3px_14px_rgba(27,53,40,0.03)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-medium text-[#718078]">Siklus kerja</p><h2 className="mt-2 text-lg font-semibold">{periodName ?? "Belum ada siklus aktif"}</h2></div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eff7f1] text-[#15734c]"><Clock3 size={20} /></span>
          </div>
          <div className="mt-7 flex items-end justify-between"><div><span className="text-3xl font-semibold tracking-tight">{count}</span><span className="ml-1 text-sm text-[#7b8980]">/ 15 Hadir</span></div><p className="text-xs font-medium text-[#718078]">{complete ? "Siklus selesai" : `${15 - count} kehadiran tersisa`}</p></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#2ba36c] transition-all duration-500" style={{ width: `${Math.min(count / 15 * 100, 100)}%` }} /></div>
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#f6f8f6] p-4 text-sm text-[#637168]">
            <CircleCheck size={17} className="mt-0.5 shrink-0 text-[#15734c]" />
            <p>{complete ? "Siklus 15 kehadiran selesai. Siklus baru berjalan otomatis." : attendedToday ? "Kehadiran hari ini sudah tercatat. Kembali besok untuk absen lagi." : absenceReportedToday ? "Hari ini sudah memiliki laporan cuti atau potong gaji, jadi tidak dapat digunakan untuk absensi." : "Absen satu kali pada setiap hari kerja untuk menambah saldo gajimu."}</p>
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-2xl border border-[#e6ece6] bg-white p-6 shadow-[0_3px_14px_rgba(27,53,40,0.03)] sm:p-8">
          <div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#718078]">Total gaji sementara</p><p className="mt-3 text-[32px] font-semibold tracking-tight text-[#123e2d]">{currency(wage)}</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eff7f1] text-[#15734c]"><WalletCards size={21} /></span></div>
          <p className="mt-4 text-xs leading-5 text-[#89958d]">Rp 50.000 untuk setiap kehadiran · maksimal Rp 1.500.000 per siklus.</p>
          <button
            onClick={attend}
            disabled={busy || attendedToday || absenceReportedToday || complete || !periodName}
            className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#15734c] text-base font-semibold text-white shadow-[0_8px_18px_rgba(21,115,76,0.17)] transition hover:bg-[#105d3d] disabled:cursor-not-allowed disabled:bg-[#dce5de] disabled:text-[#7b8980] disabled:shadow-none"
          >
            {busy ? <LoaderCircle size={19} className="animate-spin" /> : attendedToday || absenceReportedToday || complete ? <Check size={19} /> : <CircleCheck size={19} />}
            {!periodName ? "Belum ada siklus aktif" : complete ? "Siklus 15 Kehadiran Selesai" : attendedToday ? "Sudah Absen Hari Ini" : absenceReportedToday ? "Ada Laporan untuk Hari Ini" : busy ? "Mencatat kehadiran..." : "Absen Hadir Hari Ini"}
          </button>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-[#15734c]">{notice}</p>}
        </article>
      </section>

      <section className="mt-6 grid gap-5 rounded-2xl border border-[#e6ece6] bg-white p-5 sm:grid-cols-[1fr_0.9fr] sm:p-6">
        <div>
          <h2 className="font-semibold">Cuti atau potong gaji</h2>
          <p className="mt-1 text-sm leading-6 text-[#718078]">
            Ajukan satu cuti/off tanpa upah per siklus, hanya untuk Senin–Kamis. Jumat–Minggu tetap hari kerja.
            Jika tidak masuk pada tanggal lain, ajukan potong gaji agar owner dapat meninjaunya.
          </p>
          <form onSubmit={submitAbsence} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Jenis laporan</span>
              <select
                value={absenceKind}
                onChange={(event) => setAbsenceKind(event.target.value as "LEAVE" | "EXPLANATION")}
                className="h-11 w-full rounded-xl border border-[#e1e8e2] bg-white px-3 text-sm outline-none focus:border-[#15734c]"
              >
                <option value="LEAVE">Ajukan cuti/off (tidak dibayar)</option>
                <option value="EXPLANATION">Cuti tak berbayar / potong gaji</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Tanggal</span>
              <input
                type="date"
                required
                value={absenceDate}
                onChange={(event) => setAbsenceDate(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#e1e8e2] px-3 text-sm outline-none focus:border-[#15734c]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Alasan</span>
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={absenceReason}
                onChange={(event) => setAbsenceReason(event.target.value)}
                className="min-h-24 w-full rounded-xl border border-[#e1e8e2] px-3 py-2.5 text-sm outline-none focus:border-[#15734c]"
                placeholder="Tuliskan alasan ketidakhadiran"
              />
            </label>
            {absenceError && <p role="alert" className="text-sm text-red-700">{absenceError}</p>}
            {absenceNotice && <p role="status" className="text-sm text-[#15734c]">{absenceNotice}</p>}
            <button
              disabled={absenceBusy || !absenceDate || absenceReason.trim().length < 5}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#15734c] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {absenceBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
              Kirim ke owner
            </button>
          </form>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Laporan terbaru</h3>
          <div className="mt-3 divide-y divide-[#edf1ed] rounded-xl border border-[#edf1ed]">
            {absenceReports.length ? absenceReports.map((report) => (
              <div key={report.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{formatDate(report.date)}</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${report.status === "APPROVED" ? "bg-[#eaf5ee] text-[#15734c]" : report.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    {report.status === "APPROVED" ? "Disetujui" : report.status === "REJECTED" ? "Ditolak" : "Menunggu"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#718078]">{report.kind === "LEAVE" ? "Cuti/off" : "Potong gaji"} · {report.reason}</p>
                {report.salaryDeduction > 0 && (
                  <p className="mt-1 text-xs font-medium text-red-700">Potongan gaji: {currency(report.salaryDeduction)}</p>
                )}
              </div>
            )) : <p className="px-4 py-8 text-center text-sm text-[#89958d]">Belum ada laporan.</p>}
          </div>
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#e6ece6] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eff7f1] text-[#15734c]">
            {count >= 10 ? <Banknote size={19} /> : <LockKeyhole size={19} />}
          </span>
          <div>
            <h2 className="font-semibold">Pinjaman karyawan</h2>
            <p className="mt-1 text-sm text-[#718078]">
              Akses setelah 10 hari hadir pada siklus aktif. Batas total pinjaman aktif Rp 300.000.
            </p>
            {count < 10 && (
              <p className="mt-2 text-xs font-medium text-[#89958d]">
                Progress: {count} / 10 hari hadir
              </p>
            )}
          </div>
        </div>
        {count >= 10 ? (
          <Link
            href="/dashboard/employee/loan"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#15734c] px-4 text-sm font-semibold text-white hover:bg-[#105d3d]"
          >
            Buka halaman pinjaman
          </Link>
        ) : (
          <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f5f3] px-4 text-sm font-semibold text-[#7b8980]">
            Terkunci
          </span>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white shadow-[0_3px_14px_rgba(27,53,40,0.03)]">
        <div className="flex items-center justify-between border-b border-[#edf1ed] px-5 py-5 sm:px-7">
          <div><h2 className="text-base font-semibold">Riwayat kehadiran</h2><p className="mt-1 text-xs text-[#89958d]">Catatan pada siklus berjalan</p></div>
          <span className="rounded-full bg-[#eff7f1] px-3 py-1 text-xs font-semibold text-[#15734c]">{history.length} catatan</span>
        </div>
        <div className="divide-y divide-[#edf1ed]">
          {history.map((item, index) => (
            <div key={`${item.date}-${index}`} className="flex items-center justify-between px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#eaf5ee] text-[#15734c]"><Check size={16} /></span><span><span className="block text-sm font-medium">{formatDate(item.date)}</span><span className="mt-1 block text-xs text-[#89958d]">Hadir · {formatTime(item.attendedAt)}</span></span></div>
              <span className="text-sm font-semibold text-[#31443a]">+{currency(item.wage)}</span>
            </div>
          ))}
          {history.length === 0 && <div className="px-5 py-10 text-center text-sm text-[#89958d]">Belum ada absensi pada siklus ini.</div>}
        </div>
      </section>
    </>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date) + " WIB";
}

function jakartaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
