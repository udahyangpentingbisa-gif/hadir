import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  try {
    const period = await prisma.payPeriod.findFirst({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
    });
    if (!period) return NextResponse.json({ error: "Belum ada periode aktif." }, { status: 409 });
    const records = await prisma.attendance.groupBy({
      by: ["userId"],
      where: { periodId: period.id },
      _count: { _all: true },
      _sum: { wageEarned: true },
    });
    const employees = await prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    });
    const wageByUser = new Map(records.map((record) => [record.userId, record._sum.wageEarned ?? 0]));
    const daysByUser = new Map(records.map((record) => [record.userId, record._count._all]));
    const lines = [
      ["Nama", "Username", "Hari Hadir", "Total Gaji"].map(csvCell).join(","),
      ...employees.map((employee) =>
        [employee.name, employee.username, daysByUser.get(employee.id) ?? 0, wageByUser.get(employee.id) ?? 0]
          .map(csvCell)
          .join(","),
      ),
    ];
    return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${period.periodName.replace(/[^a-zA-Z0-9_-]/g, "-")}.csv"`,
      },
    });
  } catch (error) {
    console.error("Ekspor laporan gaji gagal:", error);
    return NextResponse.json({ error: "Laporan tidak dapat diekspor." }, { status: 500 });
  }
}
