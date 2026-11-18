import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dateFromKey } from "@/lib/dates";
import { PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
import { advancePayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; attendanceId: string }> };
const attendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodId: z.string().min(1),
  wageEarned: z.number().int().min(0).max(2_000_000_000),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const parsed = attendanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data absensi tidak valid." }, { status: 400 });
  const date = dateFromKey(parsed.data.date);
  if (date.toISOString().slice(0, 10) !== parsed.data.date) {
    return NextResponse.json({ error: "Tanggal absensi tidak valid." }, { status: 400 });
  }

  const { id, attendanceId } = await context.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.attendance.findFirst({
        where: { id: attendanceId, userId: id },
        select: { id: true },
      });
      if (!current) throw new Error("ATTENDANCE_NOT_FOUND");
      const period = await tx.payPeriod.findFirst({
        where: { id: parsed.data.periodId, employeeId: id },
        select: { id: true, isActive: true },
      });
      if (!period) throw new Error("PERIOD_NOT_FOUND");
      const absence = await tx.absenceReport.findFirst({
        where: { userId: id, date, status: { in: ["PENDING", "APPROVED"] } },
        select: { id: true },
      });
      if (absence) throw new Error("ABSENCE_ALREADY_REPORTED");

      const record = await tx.attendance.update({
        where: { id: attendanceId },
        data: { date, periodId: period.id, wageEarned: parsed.data.wageEarned },
        select: { id: true, date: true, periodId: true, wageEarned: true },
      });
      const attendanceCount = await tx.attendance.count({
        where: { userId: id, periodId: period.id },
      });
      let nextPeriod = null;
      if (period.isActive && attendanceCount === PERIOD_ATTENDANCE_LIMIT) {
        const lastAttendance = await tx.attendance.findFirst({
          where: { userId: id, periodId: period.id },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          select: { date: true },
        });
        if (!lastAttendance) throw new Error("PERIOD_ATTENDANCE_INCONSISTENT");
        nextPeriod = await advancePayPeriod(tx, period.id, id, lastAttendance.date);
      }
      return { record, nextPeriod };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({
      record: { ...result.record, date: result.record.date.toISOString() },
      cycleCompleted: Boolean(result.nextPeriod),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ATTENDANCE_NOT_FOUND") {
      return NextResponse.json({ error: "Catatan absensi tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PERIOD_NOT_FOUND") {
      return NextResponse.json({ error: "Siklus karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ABSENCE_ALREADY_REPORTED") {
      return NextResponse.json({ error: "Tanggal tersebut memiliki laporan ketidakhadiran yang belum ditolak." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Karyawan sudah memiliki absensi pada tanggal tersebut." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Absensi berubah bersamaan. Muat ulang lalu coba lagi." }, { status: 409 });
    }
    console.error("Perubahan absensi gagal:", error);
    return NextResponse.json({ error: "Catatan absensi tidak dapat diperbarui." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const { id, attendanceId } = await context.params;
  try {
    const deleted = await prisma.attendance.deleteMany({
      where: { id: attendanceId, userId: id },
    });
    if (deleted.count === 0) return NextResponse.json({ error: "Catatan absensi tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Penghapusan koreksi absensi gagal:", error);
    return NextResponse.json({ error: "Catatan absensi tidak dapat dihapus." }, { status: 500 });
  }
}
