"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, Check, ChevronRight, CirclePlus, FileText, LoaderCircle, Pencil, Trash2, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createRealtimeClient,
  type LiveQueryState,
  type MaterializedLiveQuerySubscription,
  type SealedLiveQuery,
} from "@neon/realtime/client";

export type EmployeeRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  attendanceCount: number;
  wageTotal: number;
};

type AttendanceRow = { id: string; date: string; wageEarned: number };
type AbsenceReportRow = {
  id: string;
  date: string;
  kind: "LEAVE" | "EXPLANATION";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  salaryDeduction: number;
  employeeName: string;
  username: string;
};
type LiveEmployeeRow = EmployeeRow & { attendedToday: boolean };
type NeonServiceStatus = {
  postgres: { status: string };
  auth: { status: string; message?: string };
  aiGateway: { status: string; enabledModels?: number; message?: string };
};

export function OwnerDashboard({
  initialEmployees,
  initialActiveCycleCount,
  initialAbsenceReports,
  initialTotalWage,
  initialPresentToday,
  realtimeUrl,
}: {
  initialEmployees: EmployeeRow[];
  initialActiveCycleCount: number;
  initialAbsenceReports: AbsenceReportRow[];
  initialTotalWage: number;
  initialPresentToday: number;
  realtimeUrl: string | null;
}) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [activeCycleCount, setActiveCycleCount] = useState(initialActiveCycleCount);
  const [absenceReports, setAbsenceReports] = useState(initialAbsenceReports);
  const [totalWage, setTotalWage] = useState(initialTotalWage);
  const [modal, setModal] = useState<"add" | "edit" | "detail" | null>(null);
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [presentToday, setPresentToday] = useState(initialPresentToday);
  const [realtimeState, setRealtimeState] = useState<LiveQueryState["status"]>("connecting");
  const [realtimeError, setRealtimeError] = useState("");
  const [neonServices, setNeonServices] = useState<NeonServiceStatus | null>(null);

  useEffect(() => {
    setEmployees(initialEmployees);
    setActiveCycleCount(initialActiveCycleCount);
    setTotalWage(initialTotalWage);
    setPresentToday(initialPresentToday);
  }, [initialEmployees, initialActiveCycleCount, initialTotalWage, initialPresentToday]);

  useEffect(() => {
    const updateDashboard = async () => {
      try {
        const response = await fetch("/api/owner/summary", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Ringkasan tidak dapat diperbarui.");
        const absenceResponse = await fetch("/api/owner/absences", { cache: "no-store" });
        const absenceResult = await absenceResponse.json();
        if (!absenceResponse.ok) throw new Error(absenceResult.error ?? "Laporan ketidakhadiran gagal dimuat.");
        setEmployees(result.employees);
        setActiveCycleCount(result.activeCycleCount);
        setTotalWage(result.totalWage);
        setAbsenceReports(absenceResult.reports);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ringkasan tidak dapat diperbarui.");
      }
    };
    const interval = window.setInterval(updateDashboard, 30_000);
    window.addEventListener("focus", updateDashboard);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateDashboard);
    };
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let renewalTimer: number | undefined;
    let renewInProgress = false;
    let subscription: MaterializedLiveQuerySubscription<LiveEmployeeRow> | undefined;
    let client: ReturnType<typeof createRealtimeClient> | undefined;

    async function getSealedQuery(): Promise<SealedLiveQuery<LiveEmployeeRow>> {
      const response = await fetch("/api/owner/attendance/live-query", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Live query absensi gagal disiapkan.");
      }
      return result.sealedQuery as SealedLiveQuery<LiveEmployeeRow>;
    }

    async function renewSubscription() {
      if (disposed || renewInProgress || !subscription) return;
      renewInProgress = true;
      try {
        await subscription.renew(await getSealedQuery());
      } catch (caught) {
        if (!disposed) {
          setRealtimeError(
            caught instanceof Error ? caught.message : "Live query gagal diperbarui.",
          );
        }
      } finally {
        renewInProgress = false;
      }
    }

    async function connectRealtime() {
      if (!realtimeUrl) {
        setRealtimeState("error");
        setRealtimeError("NEON_REALTIME_URL belum tersedia.");
        return;
      }
      client = createRealtimeClient({ url: realtimeUrl });
      subscription = client.subscribe<LiveEmployeeRow>(await getSealedQuery());
      subscription.onChange((snapshot) => {
        if (disposed) return;
        setRealtimeState(snapshot.status);
        setRealtimeError(snapshot.status === "error" ? snapshot.error.message : "");
        if (snapshot.data) {
          const rows = snapshot.data.map((row) => ({
            id: row.id,
            name: row.name,
            username: row.username,
            email: row.email,
            attendanceCount: row.attendanceCount,
            wageTotal: row.wageTotal,
          }));
          setEmployees(rows);
          setTotalWage(rows.reduce((sum, row) => sum + row.wageTotal, 0));
          setPresentToday(snapshot.data.filter((row) => row.attendedToday).length);
        }
      });
      renewalTimer = window.setInterval(() => {
        void renewSubscription();
      }, 40_000);
    }

    void connectRealtime().catch((caught: unknown) => {
      if (!disposed) {
        setRealtimeState("error");
        setRealtimeError(
          caught instanceof Error ? caught.message : "Koneksi Realtime gagal.",
        );
      }
    });

    return () => {
      disposed = true;
      if (renewalTimer !== undefined) window.clearInterval(renewalTimer);
      subscription?.unsubscribe();
      client?.close();
    };
  }, [realtimeUrl]);

  useEffect(() => {
    let active = true;
    fetch("/api/owner/neon-status", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Status layanan Neon gagal dimuat.");
        }
        if (active) setNeonServices(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        console.error("Gagal memuat status layanan Neon:", caught);
        setError(
          caught instanceof Error ? caught.message : "Status layanan Neon gagal dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshData() {
    const response = await fetch("/api/owner/summary", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Data gagal diperbarui.");
    const absenceResponse = await fetch("/api/owner/absences", { cache: "no-store" });
    const absenceResult = await absenceResponse.json();
    if (!absenceResponse.ok) throw new Error(absenceResult.error ?? "Laporan ketidakhadiran gagal dimuat.");
    setEmployees(result.employees);
    setActiveCycleCount(result.activeCycleCount);
    setTotalWage(result.totalWage);
    setAbsenceReports(absenceResult.reports);
    router.refresh();
  }

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(
        selected ? `/api/owner/employees/${selected.id}` : "/api/owner/employees",
        {
          method: selected ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Akun gagal disimpan.");
      setModal(null);
      setSelected(null);
      setNotice(selected ? "Data karyawan berhasil diperbarui." : "Akun karyawan berhasil dibuat.");
      await refreshData();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? "Tidak dapat menghubungi server. Pastikan aplikasi masih berjalan, lalu coba lagi."
          : caught instanceof Error
            ? caught.message
            : "Akun karyawan gagal disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployee(employee: EmployeeRow) {
    if (!window.confirm(`Hapus akun ${employee.name}? Riwayat absensi dan pinjaman tertutup juga akan dihapus. Pinjaman pending/belum lunas harus diselesaikan lebih dulu.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/owner/employees/${employee.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Akun gagal dihapus.");
      setNotice("Akun karyawan berhasil dihapus.");
      await refreshData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewAbsence(report: AbsenceReportRow, status: "APPROVED" | "REJECTED") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/owner/absences/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as {
        error?: string;
        report?: { id: string; status: "APPROVED" | "REJECTED"; salaryDeduction: number };
      };
      const updatedReport = result.report;
      if (!response.ok || !updatedReport) {
        throw new Error(result.error ?? "Laporan ketidakhadiran gagal diperbarui.");
      }
      setAbsenceReports((reports) =>
        reports.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: updatedReport.status,
                salaryDeduction: updatedReport.salaryDeduction,
              }
            : item,
        ),
      );
      setNotice(status === "APPROVED" ? "Laporan ketidakhadiran disetujui." : "Laporan ketidakhadiran ditolak.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Laporan ketidakhadiran gagal diperbarui.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(employee: EmployeeRow) {
    setSelected(employee);
    setModal("edit");
    setError("");
  }

  async function openDetails(employee: EmployeeRow) {
    setSelected(employee);
    setAttendanceRows([]);
    setActivePeriodId(null);
    setModal("detail");
    setError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/owner/employees/${employee.id}/attendances`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Detail absensi gagal dimuat.");
      setActivePeriodId(result.periodId);
      setAttendanceRows(result.records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Detail absensi gagal dimuat.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function addAttendance() {
    if (!selected || !attendanceDate) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/owner/employees/${selected.id}/attendances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: attendanceDate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Koreksi absensi gagal.");
      setAttendanceDate("");
      setNotice("Absensi koreksi berhasil ditambahkan.");
      await openDetails(selected);
      await refreshData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Koreksi absensi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAttendance(record: AttendanceRow) {
    if (!selected || !window.confirm(`Hapus hanya catatan absensi tanggal ${formatDate(record.date)}? Gaji siklus akan dihitung ulang.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/owner/employees/${selected.id}/attendances/${record.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Absensi gagal dihapus.");
      setNotice("Catatan absensi dihapus; total gaji dihitung ulang.");
      await openDetails(selected);
      await refreshData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Absensi gagal dihapus.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAllActiveAttendance() {
    if (
      !selected ||
      !activePeriodId ||
      attendanceRows.length === 0 ||
      !window.confirm(
        `Hapus semua ${attendanceRows.length} catatan absensi pada siklus aktif ${selected.name}? Siklus sebelumnya tidak terpengaruh dan gaji siklus aktif dihitung ulang.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/owner/employees/${selected.id}/attendances`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: activePeriodId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Catatan absensi gagal dihapus.");
      if (typeof result.deletedCount !== "number") {
        throw new Error("Respons penghapusan absensi tidak valid.");
      }
      setNotice(
        result.deletedCount === 0
          ? "Tidak ada catatan absensi di siklus aktif."
          : `${result.deletedCount} catatan absensi siklus aktif dihapus; gaji dihitung ulang.`,
      );
      await openDetails(selected);
      await refreshData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catatan absensi gagal dihapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mt-9 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white shadow-[0_3px_14px_rgba(27,53,40,0.03)]">
        <div className="flex items-start gap-3 border-b border-[#edf1ed] px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl bg-[#eff7f1] text-[#15734c]"><CalendarDays size={18} /></span>
            <div>
              <p className="text-sm font-semibold">Siklus kerja per karyawan</p>
              <p className="mt-1 text-xs text-[#7b8980]">{activeCycleCount} siklus aktif · Siklus berikutnya otomatis dimulai setelah 15 absensi tiap karyawan.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white shadow-[0_3px_14px_rgba(27,53,40,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#edf1ed] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Manajemen karyawan</h2>
            <p className="mt-1 text-sm text-[#7b8980]">{employees.length} akun terdaftar · {presentToday} hadir hari ini · Gaji siklus aktif {currency(totalWage)}</p>
          </div>
          <button onClick={() => { setSelected(null); setModal("add"); setError(""); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#15734c] px-4 text-sm font-semibold text-white transition hover:bg-[#105d3d]">
            <CirclePlus size={17} /> Tambah karyawan
          </button>
        </div>
        {(error || notice) && (
          <div className={`mx-5 mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm sm:mx-6 ${error ? "bg-red-50 text-red-700" : "bg-[#eff7f1] text-[#15734c]"}`} role={error ? "alert" : "status"}>
            <span>{error || notice}</span>
            <button onClick={() => { setError(""); setNotice(""); }} aria-label="Tutup notifikasi"><X size={16} /></button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="bg-[#fafcfa] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#89958d]">
              <tr><th className="px-6 py-3.5">Karyawan</th><th className="px-4 py-3.5">Kehadiran</th><th className="px-4 py-3.5">Gaji siklus</th><th className="px-6 py-3.5 text-right">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ed]">
              {employees.map((employee) => (
                <tr key={employee.id} className="transition hover:bg-[#fcfdfc]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f3eb] text-sm font-semibold text-[#15734c]">{employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                      <span><span className="block text-sm font-semibold">{employee.name}</span><span className="mt-1 block text-xs text-[#89958d]">@{employee.username}{employee.email ? ` · ${employee.email}` : ""}</span></span>
                    </div>
                  </td>
                  <td className="px-4 py-4"><div className="text-sm font-semibold">{employee.attendanceCount} <span className="font-normal text-[#89958d]">/ 15 Hadir</span></div><div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#2ba36c]" style={{ width: `${Math.min(employee.attendanceCount / 15 * 100, 100)}%` }} /></div></td>
                  <td className="px-4 py-4 text-sm font-semibold">{currency(employee.wageTotal)}</td>
                  <td className="px-6 py-4"><div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(employee)} aria-label={`Edit ${employee.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#637168] transition hover:bg-[#eff7f1] hover:text-[#15734c]"><Pencil size={16} /></button>
                    <button onClick={() => void openDetails(employee)} aria-label={`Detail absensi ${employee.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#637168] transition hover:bg-[#eff7f1] hover:text-[#15734c]"><FileText size={16} /></button>
                    <button onClick={() => void deleteEmployee(employee)} disabled={busy} aria-label={`Hapus ${employee.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#9a6b63] transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 size={16} /></button>
                    <span className="grid h-9 w-5 place-items-center text-[#bbc4bd]"><ChevronRight size={16} /></span>
                  </div></td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={4} className="px-6 py-14 text-center"><UsersRound size={24} className="mx-auto text-[#a6b2a9]" /><p className="mt-3 text-sm font-medium">Belum ada karyawan</p><p className="mt-1 text-xs text-[#89958d]">Tambahkan akun untuk mulai mencatat kehadiran.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#e6ece6] bg-white shadow-[0_3px_14px_rgba(27,53,40,0.03)]">
        <div className="border-b border-[#edf1ed] px-5 py-5 sm:px-6">
          <h2 className="text-lg font-semibold">Laporan cuti dan potong gaji</h2>
          <p className="mt-1 text-sm text-[#7b8980]">
            {absenceReports.length} laporan · {absenceReports.filter((report) => report.status === "PENDING").length} menunggu persetujuan.
          </p>
        </div>
        <div className="divide-y divide-[#edf1ed]">
          {absenceReports.map((report) => (
            <div key={report.id} className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <div>
                <p className="text-sm font-semibold">{report.employeeName} <span className="font-normal text-[#89958d]">@{report.username}</span></p>
                <p className="mt-1 text-xs text-[#718078]">{report.kind === "LEAVE" ? "Cuti/off (tidak dibayar)" : "Cuti tak berbayar / potong gaji"} · {formatDate(report.date)}</p>
                <p className="mt-2 text-sm text-[#536258]">{report.reason}</p>
                {report.salaryDeduction > 0 && (
                  <p className="mt-1 text-xs font-medium text-red-700">Potongan gaji: {currency(report.salaryDeduction)}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  report.status === "APPROVED"
                    ? "bg-[#eaf5ee] text-[#15734c]"
                    : report.status === "REJECTED"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                }`}>
                  {report.status === "APPROVED" ? "Disetujui" : report.status === "REJECTED" ? "Ditolak" : "Menunggu"}
                </span>
                {report.status === "PENDING" && (
                  <>
                    <button onClick={() => void reviewAbsence(report, "APPROVED")} disabled={busy} className="h-9 rounded-lg bg-[#15734c] px-3 text-xs font-semibold text-white disabled:opacity-50">Setujui</button>
                    <button onClick={() => void reviewAbsence(report, "REJECTED")} disabled={busy} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50">Tolak</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {absenceReports.length === 0 && <p className="px-6 py-10 text-center text-sm text-[#89958d]">Belum ada laporan cuti atau potong gaji.</p>}
        </div>
      </section>

      <section aria-label="Status layanan Neon" className="mt-4 grid gap-3 sm:grid-cols-3">
        <ServiceStatus label="Postgres" status={neonServices?.postgres.status ?? "checking"} />
        <ServiceStatus
          label="Neon Auth"
          status={neonServices?.auth.status ?? "checking"}
          detail={neonServices?.auth.message}
        />
        <ServiceStatus
          label="AI Gateway"
          status={neonServices?.aiGateway.status ?? "checking"}
          detail={
            neonServices?.aiGateway.enabledModels === 0
              ? "Gateway tersambung; model memerlukan kredit."
              : neonServices?.aiGateway.enabledModels !== undefined
                ? `${neonServices.aiGateway.enabledModels} model aktif`
                : neonServices?.aiGateway.message
          }
        />
      </section>
      <p className="mt-2 text-right text-xs text-[#89958d]" role="status" aria-live="polite">
        Absensi realtime: {realtimeState === "live" ? "aktif" : realtimeState === "connecting" ? "menghubungkan..." : realtimeState}
        {realtimeError ? ` — ${realtimeError}` : ""}
      </p>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251a]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-semibold tracking-wide text-[#15734c]">{modal === "detail" ? "RIWAYAT ABSENSI" : modal === "edit" ? "PERBARUI DATA" : "AKUN BARU"}</p><h3 id="employee-dialog-title" className="mt-2 text-xl font-semibold">{modal === "detail" ? `Detail ${selected?.name ?? "karyawan"}` : modal === "edit" ? "Edit karyawan" : "Tambah karyawan"}</h3></div>
              <button onClick={() => setModal(null)} aria-label="Tutup" className="grid h-9 w-9 place-items-center rounded-lg text-[#718078] hover:bg-[#f2f6f2]"><X size={18} /></button>
            </div>
            {modal === "detail" ? (
              <div className="mt-6">
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1"><span className="mb-1.5 block text-sm font-medium">Tambah/koreksi kehadiran</span><input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} className="h-11 w-full rounded-xl border border-[#e1e8e2] px-3 text-sm outline-none focus:border-[#15734c]" /></label>
                  <button type="button" onClick={() => void addAttendance()} disabled={busy || !attendanceDate} className="h-11 rounded-xl bg-[#15734c] px-4 text-sm font-semibold text-white disabled:opacity-50">Tambah</button>
                </div>
                <p className="mt-2 text-xs text-[#89958d]">Tanggal lampau, hari ini, atau mendatang dapat dicatat owner. Tiap karyawan memiliki siklus sendiri; absensi memberi gaji Rp 50.000 dan siklus berganti setelah 15 kehadiran.</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#89958d]">{attendanceRows.length} catatan di siklus aktif</p>
                  <button
                    type="button"
                    disabled={busy || detailLoading || attendanceRows.length === 0}
                    onClick={() => void removeAllActiveAttendance()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Hapus semua catatan
                  </button>
                </div>
                {(error || notice) && <p role={error ? "alert" : "status"} className={`mt-3 text-sm ${error ? "text-red-700" : "text-[#15734c]"}`}>{error || notice}</p>}
                <div className="mt-5 max-h-64 divide-y divide-[#edf1ed] overflow-y-auto rounded-xl border border-[#edf1ed]">
                  {detailLoading ? <p className="p-5 text-center text-sm text-[#718078]">Memuat riwayat...</p> : attendanceRows.length ? attendanceRows.map((record) => (
                    <div key={record.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div><p className="text-sm font-medium">{formatDate(record.date)}</p><p className="mt-1 text-xs text-[#89958d]">{currency(record.wageEarned)}</p></div>
                      <button type="button" disabled={busy} onClick={() => void removeAttendance(record)} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Hapus ini saja</button>
                    </div>
                  )) : <p className="p-5 text-center text-sm text-[#89958d]">Belum ada absensi pada siklus aktif.</p>}
                </div>
              </div>
            ) : (
            <form key={`${modal}-${selected?.id ?? "new"}`} onSubmit={submitEmployee} className="mt-6 space-y-4">
              <Field label="Nama lengkap" name="name" defaultValue={selected?.name} required placeholder="Contoh: Siti Rahma" />
              <Field label="Username" name="username" defaultValue={selected?.username} required placeholder="contoh: siti.rahma" />
              <Field label="Email (opsional)" name="email" type="email" defaultValue={selected?.email ?? ""} placeholder="nama@email.com" />
              <Field label={modal === "edit" ? "Kata sandi baru (opsional)" : "Kata sandi"} name="password" type="password" required={modal === "add"} minLength={modal === "add" ? 8 : undefined} placeholder={modal === "edit" ? "Kosongkan jika tidak diubah" : "Minimal 8 karakter"} />
              {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-[#e1e8e2] px-4 text-sm font-semibold text-[#536258]">Batal</button>
                <button disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#15734c] px-5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} Simpan
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, ...props }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; minLength?: number; placeholder: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span><input {...props} className="h-11 w-full rounded-xl border border-[#e1e8e2] px-3.5 text-sm outline-none transition focus:border-[#15734c] focus:ring-4 focus:ring-[#15734c]/10" /></label>;
}

function currency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function ServiceStatus({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail?: string;
}) {
  const ready = status === "connected";
  return (
    <article className="rounded-xl border border-[#e6ece6] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ready ? "bg-[#eaf5ee] text-[#15734c]" : status === "checking" ? "bg-[#f3f5f3] text-[#718078]" : "bg-amber-50 text-amber-700"}`}>
          {status === "checking" ? "Memeriksa" : ready ? "Tersambung" : status === "unavailable" ? "Gangguan" : "Perlu konfigurasi"}
        </span>
      </div>
      {detail && <p className="mt-1 text-xs leading-5 text-[#718078]">{detail}</p>}
    </article>
  );
}
