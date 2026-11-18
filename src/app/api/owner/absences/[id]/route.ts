import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dateFromKey } from "@/lib/dates";
import { DAILY_WAGE } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const editSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kind: z.enum(["LEAVE", "EXPLANATION"]).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
  salaryDeduction: z.number().int().min(0).max(2_000_000_000).optional(),
  periodId: z.string().min(1).optional(),
}).refine((value) => Object.keys(value).length > 0);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Perubahan laporan tidak valid." }, { status: 400 });
  }
  const date = parsed.data.date ? dateFromKey(parsed.data.date) : undefined;
  if (date && date.toISOString().slice(0, 10) !== parsed.data.date) {
    return NextResponse.json({ error: "Tanggal laporan tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        const current = await tx.absenceReport.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            periodId: true,
            date: true,
            kind: true,
            status: true,
            salaryDeduction: true,
          },
        });
        if (!current) throw new Error("REPORT_NOT_FOUND");
        const nextStatus = parsed.data.status ?? current.status;
        const nextDate = date ?? current.date;
        const nextKind = parsed.data.kind ?? current.kind;
        const nextPeriodId = parsed.data.periodId ?? current.periodId;

        const period = await tx.payPeriod.findFirst({
          where: { id: nextPeriodId, employeeId: current.userId },
          select: { id: true },
        });
        if (!period) throw new Error("PERIOD_NOT_FOUND");
        if (nextStatus !== "REJECTED") {
          const attendance = await tx.attendance.findUnique({
            where: { userId_date: { userId: current.userId, date: nextDate } },
            select: { id: true },
          });
          if (attendance) throw new Error("ATTENDANCE_EXISTS");
        }

        const salaryDeduction = nextStatus === "REJECTED"
          ? 0
          : parsed.data.salaryDeduction ??
            (parsed.data.kind ? (nextKind === "EXPLANATION" ? DAILY_WAGE : 0) : current.salaryDeduction);
        return tx.absenceReport.update({
          where: { id },
          data: {
            ...(date ? { date } : {}),
            ...(parsed.data.kind ? { kind: nextKind } : {}),
            ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
            ...(parsed.data.periodId ? { periodId: nextPeriodId } : {}),
            ...(parsed.data.status ? { status: nextStatus } : {}),
            salaryDeduction,
            ...(parsed.data.status
              ? { reviewedAt: nextStatus === "PENDING" ? null : new Date() }
              : {}),
          },
          select: { id: true, date: true, kind: true, reason: true, status: true, salaryDeduction: true, periodId: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ report: { ...report, date: report.date.toISOString() } });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_NOT_FOUND") {
      return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PERIOD_NOT_FOUND") {
      return NextResponse.json({ error: "Siklus karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ATTENDANCE_EXISTS") {
      return NextResponse.json({ error: "Tanggal tersebut sudah dicatat sebagai kehadiran." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Karyawan sudah memiliki laporan pada tanggal tersebut." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Status laporan berubah bersamaan. Muat ulang halaman." }, { status: 409 });
    }
    console.error("Tinjauan ketidakhadiran gagal:", error);
    return NextResponse.json({ error: "Laporan tidak dapat diperbarui." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const { id } = await context.params;
  try {
    const deleted = await prisma.absenceReport.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Laporan ketidakhadiran tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Penghapusan laporan ketidakhadiran gagal:", error);
    return NextResponse.json({ error: "Laporan ketidakhadiran tidak dapat dihapus." }, { status: 500 });
  }
}
