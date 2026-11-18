import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
import { advancePayPeriod, getOpenPayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Akses khusus karyawan." }, { status: 403 });
  }

  const todayKey = jakartaDateKey();
  const date = dateFromKey(todayKey);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const { period, attendanceCount } = await getOpenPayPeriod(tx, session.id);
        if (date < period.startDate) {
          throw new Error(`CYCLE_NOT_STARTED:${period.startDate.toISOString().slice(0, 10)}`);
        }

        const existing = await tx.attendance.findUnique({
          where: { userId_date: { userId: session.id, date } },
        });
        if (existing) throw new Error("ALREADY_ATTENDED");

        const scheduledAbsence = await tx.absenceReport.findFirst({
          where: {
            userId: session.id,
            date,
            status: { in: ["PENDING", "APPROVED"] },
          },
          select: { id: true },
        });
        if (scheduledAbsence) throw new Error("ABSENCE_ALREADY_REPORTED");

        const attendance = await tx.attendance.create({
          data: {
            userId: session.id,
            periodId: period.id,
            date,
            wageEarned: DAILY_WAGE,
          },
        });
        const count = attendanceCount + 1;
        let nextPeriod = null;
        if (count === PERIOD_ATTENDANCE_LIMIT) {
          const lastAttendance = await tx.attendance.findFirst({
            where: { userId: session.id, periodId: period.id },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: { date: true },
          });
          if (!lastAttendance) throw new Error("PERIOD_ATTENDANCE_INCONSISTENT");
          nextPeriod = await advancePayPeriod(tx, period.id, session.id, lastAttendance.date);
        }
        return { attendance, count, nextPeriod };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      ok: true,
      count: result.count,
      cycleCompleted: Boolean(result.nextPeriod),
      nextPeriodName: result.nextPeriod?.periodName ?? null,
      wageEarned: result.attendance.wageEarned,
      date: result.attendance.date.toISOString(),
      attendedAt: result.attendance.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ATTENDED") {
      return NextResponse.json({ error: "Kehadiran hari ini sudah tercatat." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ABSENCE_ALREADY_REPORTED") {
      return NextResponse.json(
        { error: "Tanggal ini sudah memiliki laporan cuti atau potong gaji sehingga tidak dapat digunakan untuk absensi." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message.startsWith("CYCLE_NOT_STARTED:")) {
      const startDate = error.message.slice("CYCLE_NOT_STARTED:".length);
      return NextResponse.json({ error: `Siklus aktif baru dimulai pada ${startDate}.` }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PERIOD_ATTENDANCE_INCONSISTENT") {
      console.error("Periode karyawan penuh tanpa catatan absensi.");
      return NextResponse.json({ error: "Siklus kerja tidak dapat diperbarui. Hubungi owner." }, { status: 500 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Kehadiran hari ini sudah tercatat." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Absensi sedang diproses. Muat ulang dan coba lagi." }, { status: 409 });
    }
    console.error("Pencatatan absensi gagal:", error);
    return NextResponse.json({ error: "Absensi gagal disimpan. Coba beberapa saat lagi." }, { status: 500 });
  }
}
