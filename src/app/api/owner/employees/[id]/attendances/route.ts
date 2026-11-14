import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { DAILY_WAGE, PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";
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
      where: { isActive: true },
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
  if (dateKey > jakartaDateKey()) {
    return NextResponse.json({ error: "Tanggal absensi tidak boleh di masa depan." }, { status: 400 });
  }

  try {
    const record = await prisma.$transaction(
      async (tx) => {
        const period = await tx.payPeriod.findFirst({
          where: { isActive: true },
          orderBy: { startDate: "desc" },
        });
        if (!period) throw new Error("NO_ACTIVE_PERIOD");
        const employee = await tx.user.findFirst({ where: { id, role: "EMPLOYEE" }, select: { id: true } });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
        const count = await tx.attendance.count({ where: { userId: id, periodId: period.id } });
        if (count >= PERIOD_ATTENDANCE_LIMIT) throw new Error("PERIOD_COMPLETE");
        return tx.attendance.create({
          data: { userId: id, periodId: period.id, date, wageEarned: DAILY_WAGE },
          select: { id: true, date: true, wageEarned: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ record: { ...record, date: record.date.toISOString() } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_ACTIVE_PERIOD") {
      return NextResponse.json({ error: "Belum ada periode aktif." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PERIOD_COMPLETE") {
      return NextResponse.json({ error: "Batas 15 hari pada periode ini sudah tercapai." }, { status: 409 });
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
