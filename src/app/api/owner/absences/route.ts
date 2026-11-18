import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  try {
    const reports = await prisma.absenceReport.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        periodId: true,
        date: true,
        kind: true,
        reason: true,
        status: true,
        salaryDeduction: true,
        user: { select: { name: true, username: true } },
        period: { select: { periodName: true } },
      },
    });
    const employeeIds = [...new Set(reports.map((report) => report.userId))];
    const periods = employeeIds.length
      ? await prisma.payPeriod.findMany({
          where: { employeeId: { in: employeeIds } },
          orderBy: { startDate: "desc" },
          select: { id: true, employeeId: true, periodName: true, isActive: true },
        })
      : [];
    return NextResponse.json({
      periods,
      reports: reports.map((report) => ({
        id: report.id,
        userId: report.userId,
        periodId: report.periodId,
        date: report.date.toISOString(),
        kind: report.kind,
        reason: report.reason,
        status: report.status,
        salaryDeduction: report.salaryDeduction,
        employeeName: report.user.name,
        username: report.user.username,
        periodName: report.period.periodName,
      })),
    });
  } catch (error) {
    console.error("Gagal memuat laporan ketidakhadiran:", error);
    return NextResponse.json({ error: "Laporan ketidakhadiran tidak dapat dimuat." }, { status: 503 });
  }
}
