import { AlertCircle, CalendarCheck2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { EmployeeDashboard } from "@/components/employee-dashboard";
import { dateFromKey, formatJakartaDate, jakartaDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EmployeePage() {
  const session = await getSession();
  let dashboardData: {
    count: number;
    wage: number;
    attendedToday: boolean;
    absenceReportedToday: boolean;
    history: { date: string; attendedAt: string; wage: number }[];
    absenceReports: {
      id: string;
      date: string;
      kind: "LEAVE" | "EXPLANATION";
      reason: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      salaryDeduction: number;
    }[];
    periodName: string | null;
    periodId: string | null;
  } | null = null;
  let loadError = false;

  try {
    const period = await prisma.payPeriod.findFirst({
      where: { employeeId: session!.id, isActive: true },
      orderBy: { startDate: "desc" },
    });
    const today = dateFromKey(jakartaDateKey());
    const [count, records, attendedToday, absenceReportedToday, attendanceTotals, deductionTotals, absenceReports] = period
      ? await Promise.all([
          prisma.attendance.count({ where: { userId: session!.id, periodId: period.id } }),
          prisma.attendance.findMany({
            where: { userId: session!.id, periodId: period.id },
            orderBy: { date: "desc" },
            take: 10,
            select: { date: true, createdAt: true, wageEarned: true },
          }),
          prisma.attendance.findUnique({
            where: { userId_date: { userId: session!.id, date: today } },
            select: { id: true },
          }),
          prisma.absenceReport.findUnique({
            where: { userId_date: { userId: session!.id, date: today } },
            select: { id: true },
          }),
          prisma.attendance.aggregate({
            where: { userId: session!.id, periodId: period.id },
            _sum: { wageEarned: true },
          }),
          prisma.absenceReport.aggregate({
            where: { userId: session!.id, periodId: period.id },
            _sum: { salaryDeduction: true },
          }),
          prisma.absenceReport.findMany({
            where: { userId: session!.id, periodId: period.id },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 10,
            select: { id: true, date: true, kind: true, reason: true, status: true, salaryDeduction: true },
          }),
        ])
      : [0, [], null, null, null, null, []];
    dashboardData = {
      count,
      wage: Math.max(
        0,
        (attendanceTotals?._sum.wageEarned ?? 0) - (deductionTotals?._sum.salaryDeduction ?? 0),
      ),
      attendedToday: Boolean(attendedToday),
      absenceReportedToday: Boolean(absenceReportedToday),
      history: records.map((record) => ({
        date: record.date.toISOString(),
        attendedAt: record.createdAt.toISOString(),
        wage: record.wageEarned,
      })),
      absenceReports: absenceReports.map((report) => ({
        ...report,
        date: report.date.toISOString(),
      })),
      periodName: period?.periodName ?? null,
      periodId: period?.id ?? null,
    };
  } catch (error) {
    console.error("Gagal memuat halaman dashboard karyawan:", error);
    loadError = true;
  }

  return (
    <div className="min-h-screen">
      <AppHeader name={session?.name ?? "Karyawan"} role="EMPLOYEE" />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="relative overflow-hidden rounded-[26px] bg-[#123e2d] px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="absolute -right-10 -top-20 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-2 top-[-30px] h-48 w-48 rounded-full border border-white/10" />
          <div className="relative">
            <p className="text-sm font-medium text-[#b9f1ce]">{formatJakartaDate()}</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-[40px]">Halo, {session?.name?.split(" ")[0] ?? "Karyawan"} 👋</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/70">Satu langkah kecil hari ini. Catat kehadiranmu dan pantau penghasilan pada siklus berjalan.</p>
          </div>
        </section>

        {loadError ? (
          <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div><p className="font-semibold">Data absensi belum dapat dimuat.</p><p className="mt-1">Periksa koneksi database atau coba muat ulang halaman.</p></div>
          </div>
        ) : dashboardData ? (
          <EmployeeDashboard
            key={`${dashboardData.periodId ?? "none"}-${dashboardData.count}-${dashboardData.attendedToday}`}
            initialCount={dashboardData.count}
            initialWage={dashboardData.wage}
            initialAttendedToday={dashboardData.attendedToday}
            initialAbsenceReportedToday={dashboardData.absenceReportedToday}
            initialHistory={dashboardData.history}
            initialAbsenceReports={dashboardData.absenceReports}
            periodName={dashboardData.periodName}
          />
        ) : null}
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-[#89958d]"><CalendarCheck2 size={14} /> Data kehadiran dan gaji hanya dapat dilihat oleh akunmu.</p>
      </main>
    </div>
  );
}
