import { AlertCircle, ArrowUpRight, Banknote, CalendarDays, Download, UsersRound } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { OwnerDashboard, type EmployeeRow } from "@/components/owner-dashboard";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const session = await getSession();
  let data:
    | {
        employees: EmployeeRow[];
        period: { id: string; periodName: string; startDate: string; endDate: string } | null;
        presentToday: number;
        totalWage: number;
      }
    | null = null;
  let loadError = false;

  try {
    const today = dateFromKey(jakartaDateKey());
    const [users, period, presentToday] = await Promise.all([
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, email: true },
      }),
      prisma.payPeriod.findFirst({ where: { isActive: true }, orderBy: { startDate: "desc" } }),
      prisma.attendance.findMany({
        where: { date: today, user: { role: "EMPLOYEE" } },
        select: { userId: true },
      }),
    ]);
    const aggregate = period
      ? await prisma.attendance.groupBy({
          by: ["userId"],
          where: { periodId: period.id },
          _count: { _all: true },
          _sum: { wageEarned: true },
        })
      : [];
    const byUser = new Map(
      aggregate.map((row) => [
        row.userId,
        { count: row._count._all, wage: row._sum.wageEarned ?? 0 },
      ]),
    );
    const employees = users.map((user) => ({
      ...user,
      attendanceCount: byUser.get(user.id)?.count ?? 0,
      wageTotal: byUser.get(user.id)?.wage ?? 0,
    }));
    data = {
      employees,
      period: period
        ? {
            id: period.id,
            periodName: period.periodName,
            startDate: period.startDate.toISOString(),
            endDate: period.endDate.toISOString(),
          }
        : null,
      presentToday: new Set(presentToday.map((item) => item.userId)).size,
      totalWage: aggregate.reduce((sum, row) => sum + (row._sum.wageEarned ?? 0), 0),
    };
  } catch (error) {
    console.error("Gagal memuat halaman dashboard owner:", error);
    loadError = true;
  }

  return (
    <div className="min-h-screen">
      <AppHeader name={session?.name ?? "Owner"} role="OWNER" />
      <main className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-[#15734c]">RINGKASAN OPERASIONAL</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[38px]">Dashboard owner</h1>
            <p className="mt-2 text-sm text-[#718078]">Kelola tim dan pantau kehadiran dalam satu tempat.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/dashboard/owner/loans" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dce6de] bg-white px-4 text-sm font-semibold text-[#31443a] hover:bg-[#f4f8f4]">
              <Banknote size={16} /> Kelola pinjaman
            </a>
            {data?.period && (
              <a href="/api/owner/export" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dce6de] bg-white px-4 text-sm font-semibold text-[#31443a] hover:bg-[#f4f8f4]">
                <Download size={16} /> Ekspor laporan gaji
              </a>
            )}
          </div>
        </div>

        {loadError ? (
          <div role="alert" className="mt-8 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div><p className="font-semibold">Dashboard belum dapat dimuat.</p><p className="mt-1">Periksa DATABASE_URL dan pastikan migrasi database sudah dijalankan.</p></div>
          </div>
        ) : data ? (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatCard label="Total karyawan" value={String(data.employees.length)} note="Akun karyawan aktif" icon={<UsersRound size={19} />} />
              <StatCard label="Hadir hari ini" value={`${data.presentToday} / ${data.employees.length}`} note="Diperbarui saat halaman dimuat" icon={<span className="h-2.5 w-2.5 rounded-full bg-[#1da56b]" />} />
              <StatCard label="Estimasi gaji periode ini" value={formatCurrency(data.totalWage)} note={data.period?.periodName ?? "Belum ada periode aktif"} icon={<ArrowUpRight size={19} />} />
            </section>
            <OwnerDashboard
              initialEmployees={data.employees}
              initialPeriod={data.period}
              initialTotalWage={data.totalWage}
              initialPresentToday={data.presentToday}
              realtimeUrl={process.env.NEON_REALTIME_URL ?? null}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-[#e6ece6] bg-white p-5 shadow-[0_3px_14px_rgba(27,53,40,0.03)]">
      <div className="flex items-start justify-between"><p className="text-sm font-medium text-[#718078]">{label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eff7f1] text-[#15734c]">{icon}</span></div>
      <p className="mt-4 text-[28px] font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[#8b978f]">{note}</p>
    </article>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
