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
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        date: true,
        kind: true,
        reason: true,
        user: { select: { name: true, username: true } },
      },
    });
    return NextResponse.json({
      reports: reports.map((report) => ({
        id: report.id,
        date: report.date.toISOString(),
        kind: report.kind,
        reason: report.reason,
        employeeName: report.user.name,
        username: report.user.username,
      })),
    });
  } catch (error) {
    console.error("Gagal memuat laporan ketidakhadiran:", error);
    return NextResponse.json({ error: "Laporan ketidakhadiran tidak dapat dimuat." }, { status: 503 });
  }
}
