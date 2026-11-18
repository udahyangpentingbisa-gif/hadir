import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dateFromKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
import { advancePayPeriod, getOpenPayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function ownerOnly() {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 }) };
  if (session.role !== "OWNER") return { response: NextResponse.json({ error: "Akses ditolak." }, { status: 403 }) };
  return { session };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await ownerOnly();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  try {
    const employee = await prisma.user.findFirst({
      where: { id, role: "EMPLOYEE" },
      select: { id: true },
    });
    if (!employee) return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    const [periods, records] = await Promise.all([
      prisma.payPeriod.findMany({
        where: { employeeId: id },
        orderBy: { startDate: "desc" },
        select: { id: true, periodName: true, startDate: true, endDate: true, isActive: true },
      }),
      prisma.attendance.findMany({
        where: { userId: id },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          periodId: true,
          date: true,
          wageEarned: true,
          period: { select: { periodName: true } },
        },
      }),
    ]);
    return NextResponse.json({
      periods: periods.map((period) => ({
        ...period,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      })),
      records: records.map((record) => ({ ...record, date: record.date.toISOString() })),
    });
  } catch (error) {
    console.error("Gagal memuat detail absensi:", error);
    return NextResponse.json({ error: "Riwayat absensi tidak dapat dimuat." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await ownerOnly();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = z.object({
    date: dateKeySchema,
    periodId: z.string().min(1).optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Tanggal absensi tidak valid." }, { status: 400 });
  }
  const date = dateFromKey(parsed.data.date);
  if (date.toISOString().slice(0, 10) !== parsed.data.date) {
    return NextResponse.json({ error: "Tanggal absensi tidak valid." }, { status: 400 });
  }

  try {
    const record = await prisma.$transaction(
      async (tx) => {
        const employee = await tx.user.findFirst({ where: { id, role: "EMPLOYEE" }, select: { id: true } });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
        const period = parsed.data.periodId
          ? await tx.payPeriod.findFirst({
              where: { id: parsed.data.periodId, employeeId: id },
            })
          : (await getOpenPayPeriod(tx, id)).period;
        if (!period) throw new Error("PERIOD_NOT_FOUND");
        const absence = await tx.absenceReport.findFirst({
          where: {
            userId: id,
            date,
            status: { in: ["PENDING", "APPROVED"] },
          },
          select: { id: true },
        });
        if (absence) throw new Error("ABSENCE_ALREADY_REPORTED");

        const record = await tx.attendance.create({
          data: { userId: id, periodId: period.id, date, wageEarned: DAILY_WAGE },
          select: { id: true, date: true, wageEarned: true },
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      record: { ...record.record, date: record.record.date.toISOString() },
      cycleCompleted: Boolean(record.nextPeriod),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PERIOD_NOT_FOUND") {
      return NextResponse.json({ error: "Siklus karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ABSENCE_ALREADY_REPORTED") {
      return NextResponse.json(
        { error: "Tanggal ini sudah memiliki laporan cuti atau potong gaji sehingga tidak dapat digunakan untuk absensi." },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Karyawan sudah memiliki absensi pada tanggal tersebut." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Absensi berubah bersamaan. Muat ulang detail lalu coba lagi." }, { status: 409 });
    }
    console.error("Koreksi absensi gagal:", error);
    return NextResponse.json({ error: "Absensi tidak dapat ditambahkan." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await ownerOnly();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const periodId =
    typeof body === "object" && body !== null && "periodId" in body && typeof body.periodId === "string"
      ? body.periodId
      : "";
  if (!periodId) {
    return NextResponse.json({ error: "Siklus aktif tidak valid." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const employee = await tx.user.findFirst({
          where: { id, role: "EMPLOYEE" },
          select: { id: true },
        });
        if (!employee) return { notFound: true as const };

        const period = await tx.payPeriod.findFirst({
          where: { id: periodId, employeeId: id },
          select: { id: true },
        });
        if (!period) return { periodChanged: true as const };

        const deleted = await tx.attendance.deleteMany({
          where: { userId: id, periodId: period.id },
        });
        return { deletedCount: deleted.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if ("notFound" in result) {
      return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    }
    if ("periodChanged" in result) {
      return NextResponse.json(
        { error: "Siklus aktif berubah. Muat ulang detail karyawan sebelum menghapus." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, deletedCount: result.deletedCount });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Absensi berubah bersamaan. Muat ulang detail lalu coba lagi." },
        { status: 409 },
      );
    }
    console.error("Penghapusan seluruh koreksi absensi gagal:", error);
    return NextResponse.json({ error: "Catatan absensi siklus aktif tidak dapat dihapus." }, { status: 500 });
  }
}
