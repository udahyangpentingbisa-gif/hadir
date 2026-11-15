import { NextResponse } from "next/server";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  try {
    const today = dateFromKey(jakartaDateKey());
    const [employees, presentToday] = await Promise.all([
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, email: true, createdAt: true },
      }),
      prisma.attendance.findMany({
        where: { date: today, user: { role: "EMPLOYEE" } },
        select: { userId: true },
      }),
    ]);
    const periods = employees.length
      ? await prisma.payPeriod.findMany({
          where: { employeeId: { in: employees.map((employee) => employee.id) }, isActive: true },
          select: { id: true, employeeId: true },
        })
      : [];
    const activePeriodIds = periods.map((period) => period.id);
    const allAttendance = activePeriodIds.length
      ? await prisma.attendance.groupBy({
          by: ["userId"],
          where: { periodId: { in: activePeriodIds } },
          _count: { _all: true },
          _sum: { wageEarned: true },
        })
      : [];

    const byUser = new Map(
      allAttendance.map((item) => [
        item.userId,
        { count: item._count._all, wage: item._sum.wageEarned ?? 0 },
      ]),
    );
    return NextResponse.json({
      employees: employees.map((employee) => ({
        ...employee,
        createdAt: employee.createdAt.toISOString(),
        attendanceCount: byUser.get(employee.id)?.count ?? 0,
        wageTotal: byUser.get(employee.id)?.wage ?? 0,
      })),
      activeCycleCount: periods.length,
      presentToday: new Set(presentToday.map((item) => item.userId)).size,
      employeeCount: employees.length,
      totalWage: allAttendance.reduce((sum, item) => sum + (item._sum.wageEarned ?? 0), 0),
      dailyWage: DAILY_WAGE,
      periodLimit: PERIOD_ATTENDANCE_LIMIT,
    });
  } catch (error) {
    console.error("Gagal memuat ringkasan owner:", error);
    return NextResponse.json({ error: "Data dashboard tidak dapat dimuat. Periksa koneksi database." }, { status: 503 });
  }
}
