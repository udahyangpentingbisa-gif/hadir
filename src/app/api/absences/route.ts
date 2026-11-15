import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dateFromKey } from "@/lib/dates";
import { getOpenPayPeriod, isLeaveDay } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const absenceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["LEAVE", "EXPLANATION"]),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Akses khusus karyawan." }, { status: 403 });
  }

  const parsed = absenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pilih tanggal dan isi alasan ketidakhadiran minimal 5 karakter." },
      { status: 400 },
    );
  }
  const date = dateFromKey(parsed.data.date);
  if (date.toISOString().slice(0, 10) !== parsed.data.date) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (parsed.data.kind === "LEAVE" && !isLeaveDay(date)) {
    return NextResponse.json(
      { error: "Cuti/off hanya dapat diajukan pada hari Senin sampai Kamis. Jumat sampai Minggu adalah hari kerja." },
      { status: 400 },
    );
  }

  try {
    const report = await prisma.$transaction(
      async (tx) => {
        const { period } = await getOpenPayPeriod(tx, session.id);
        if (date < period.startDate) throw new Error("DATE_BEFORE_CYCLE_START");
        const [attendance, existingReport] = await Promise.all([
          tx.attendance.findUnique({
            where: { userId_date: { userId: session.id, date } },
            select: { id: true },
          }),
          tx.absenceReport.findUnique({
            where: { userId_date: { userId: session.id, date } },
            select: { id: true },
          }),
        ]);
        if (attendance) throw new Error("ATTENDANCE_EXISTS");
        if (existingReport) throw new Error("REPORT_EXISTS");

        if (parsed.data.kind === "LEAVE") {
          const leave = await tx.absenceReport.findFirst({
            where: {
              userId: session.id,
              periodId: period.id,
              kind: "LEAVE",
              status: { in: ["PENDING", "APPROVED"] },
            },
            select: { id: true },
          });
          if (leave) throw new Error("LEAVE_ALREADY_USED");
        }

        return tx.absenceReport.create({
          data: {
            userId: session.id,
            periodId: period.id,
            date,
            kind: parsed.data.kind,
            reason: parsed.data.reason,
          },
          select: {
            id: true,
            date: true,
            kind: true,
            reason: true,
            status: true,
            createdAt: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      report: { ...report, date: report.date.toISOString(), createdAt: report.createdAt.toISOString() },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ATTENDANCE_EXISTS") {
      return NextResponse.json({ error: "Tanggal ini sudah tercatat sebagai kehadiran." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DATE_BEFORE_CYCLE_START") {
      return NextResponse.json({ error: "Tanggal laporan harus berada pada atau setelah awal siklus aktif." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "REPORT_EXISTS") {
      return NextResponse.json({ error: "Laporan untuk tanggal ini sudah dikirim." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "LEAVE_ALREADY_USED") {
      return NextResponse.json({ error: "Satu pengajuan cuti/off per siklus sudah digunakan atau sedang menunggu persetujuan." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Laporan untuk tanggal ini sudah dikirim." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Laporan berubah bersamaan. Muat ulang dan coba lagi." }, { status: 409 });
    }
    console.error("Pengajuan ketidakhadiran gagal:", error);
    return NextResponse.json({ error: "Laporan ketidakhadiran tidak dapat disimpan." }, { status: 500 });
  }
}
