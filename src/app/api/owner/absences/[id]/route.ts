import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Status laporan tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        const current = await tx.absenceReport.findUnique({
          where: { id },
          select: { id: true, userId: true, date: true, kind: true, status: true },
        });
        if (!current) throw new Error("REPORT_NOT_FOUND");
        if (current.status !== "PENDING") throw new Error("REPORT_ALREADY_REVIEWED");

        if (parsed.data.status === "APPROVED") {
          const attendance = await tx.attendance.findUnique({
            where: { userId_date: { userId: current.userId, date: current.date } },
            select: { id: true },
          });
          if (attendance) throw new Error("ATTENDANCE_EXISTS");
        }

        return tx.absenceReport.update({
          where: { id, status: "PENDING" },
          data: {
            status: parsed.data.status,
            ...(parsed.data.status === "REJECTED" ? { salaryDeduction: 0 } : {}),
            reviewedAt: new Date(),
          },
          select: { id: true, status: true, salaryDeduction: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_NOT_FOUND") {
      return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "REPORT_ALREADY_REVIEWED") {
      return NextResponse.json({ error: "Laporan sudah ditinjau." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ATTENDANCE_EXISTS") {
      return NextResponse.json({ error: "Tanggal tersebut sudah dicatat sebagai kehadiran." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Status laporan berubah bersamaan. Muat ulang halaman." }, { status: 409 });
    }
    console.error("Tinjauan ketidakhadiran gagal:", error);
    return NextResponse.json({ error: "Laporan tidak dapat diperbarui." }, { status: 500 });
  }
}
