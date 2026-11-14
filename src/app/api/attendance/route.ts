import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
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
        const period = await tx.payPeriod.findFirst({
          where: { isActive: true },
          orderBy: { startDate: "desc" },
        });
        if (!period) throw new Error("NO_ACTIVE_PERIOD");

        const existing = await tx.attendance.findUnique({
          where: { userId_date: { userId: session.id, date } },
        });
        if (existing) throw new Error("ALREADY_ATTENDED");

        const count = await tx.attendance.count({
          where: { userId: session.id, periodId: period.id },
        });
        if (count >= PERIOD_ATTENDANCE_LIMIT) throw new Error("PERIOD_COMPLETE");

        const attendance = await tx.attendance.create({
          data: {
            userId: session.id,
            periodId: period.id,
            date,
            wageEarned: DAILY_WAGE,
          },
        });
        return { attendance, count: count + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      ok: true,
      count: result.count,
      wageEarned: result.attendance.wageEarned,
      date: result.attendance.date.toISOString(),
      attendedAt: result.attendance.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ATTENDED") {
      return NextResponse.json({ error: "Kehadiran hari ini sudah tercatat." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PERIOD_COMPLETE") {
      return NextResponse.json({ error: "Siklus 15 hari selesai. Menunggu reset/pembayaran owner." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "NO_ACTIVE_PERIOD") {
      return NextResponse.json({ error: "Belum ada periode aktif. Hubungi owner." }, { status: 409 });
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
