import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { dateFromKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
import { advancePayPeriod, getOpenPayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

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
    const period = await prisma.payPeriod.findFirst({
      where: { employeeId: id, isActive: true },
      orderBy: { startDate: "desc" },
    });
    const records = period
      ? await prisma.attendance.findMany({
          where: { userId: id, periodId: period.id },
          orderBy: { date: "desc" },
          select: { id: true, date: true, wageEarned: true },
        })
      : [];
    return NextResponse.json({
      periodName: period?.periodName ?? null,
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
  const dateKey =
    typeof body === "object" && body !== null && "date" in body && typeof body.date === "string"
      ? body.date
      : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: "Tanggal absensi tidak valid." }, { status: 400 });
  }
  const date = dateFromKey(dateKey);
  if (date.toISOString().slice(0, 10) !== dateKey) {
    return NextResponse.json({ error: "Tanggal absensi tidak valid." }, { status: 400 });
  }

  try {
    const record = await prisma.$transaction(
      async (tx) => {
        const employee = await tx.user.findFirst({ where: { id, role: "EMPLOYEE" }, select: { id: true } });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
        const { period, attendanceCount } = await getOpenPayPeriod(tx, id);
        const absence = await tx.absenceReport.findFirst({
          where: {
            userId: id,
            date,
          },
          select: { id: true },
        });
        if (absence) throw new Error("ABSENCE_ALREADY_REPORTED");

        const record = await tx.attendance.create({
          data: { userId: id, periodId: period.id, date, wageEarned: DAILY_WAGE },
          select: { id: true, date: true, wageEarned: true },
        });
        const count = attendanceCount + 1;
        let nextPeriod = null;
        if (count === PERIOD_ATTENDANCE_LIMIT) {
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
