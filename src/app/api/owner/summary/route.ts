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
    const [employees, period, presentToday] = await Promise.all([
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, email: true, createdAt: true },
      }),
      prisma.payPeriod.findFirst({ where: { isActive: true }, orderBy: { startDate: "desc" } }),
      prisma.attendance.findMany({
        where: { date: today, user: { role: "EMPLOYEE" } },
        select: { userId: true },
      }),
    ]);
    const allAttendance = period
      ? await prisma.attendance.groupBy({
          by: ["userId"],
          where: { periodId: period.id },
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
      period: period
        ? {
            id: period.id,
            periodName: period.periodName,
            startDate: period.startDate.toISOString(),
            endDate: period.endDate.toISOString(),
          }
        : null,
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
