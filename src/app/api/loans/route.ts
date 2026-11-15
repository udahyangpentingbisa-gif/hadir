import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { LOAN_ELIGIBILITY_DAYS, MAX_OUTSTANDING_LOAN } from "@/lib/format";
import { getOpenPayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";

const loanSchema = z.object({
  amount: z.number().int().min(1).max(MAX_OUTSTANDING_LOAN),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Akses khusus karyawan." }, { status: 403 });
  }

  const parsed = loanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Masukkan nominal pinjaman yang valid." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const { period } = await getOpenPayPeriod(tx, session.id);

        const attendanceDays = await tx.attendance.count({
          where: { userId: session.id, periodId: period.id },
        });
        if (attendanceDays < LOAN_ELIGIBILITY_DAYS) throw new Error("NOT_ELIGIBLE");

        const activeLoans = await tx.loan.aggregate({
          where: {
            userId: session.id,
            status: { in: ["PENDING", "APPROVED"] },
          },
          _sum: { amount: true },
        });
        const outstanding = activeLoans._sum.amount ?? 0;
        const available = MAX_OUTSTANDING_LOAN - outstanding;
        if (parsed.data.amount > available) {
          throw new Error("LOAN_LIMIT_EXCEEDED");
        }

        const loan = await tx.loan.create({
          data: {
            userId: session.id,
            periodId: period.id,
            amount: parsed.data.amount,
          },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
          },
        });
        return { loan, available: available - loan.amount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({
      loan: { ...result.loan, createdAt: result.loan.createdAt.toISOString() },
      available: result.available,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_ELIGIBLE") {
      return NextResponse.json({ error: "Pengajuan pinjaman terbuka setelah 10 hari hadir pada siklus aktif." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "LOAN_LIMIT_EXCEEDED") {
      return NextResponse.json({ error: "Total pinjaman aktif dan menunggu persetujuan tidak boleh melebihi Rp 300.000." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Pengajuan sedang diproses bersamaan. Silakan coba lagi." }, { status: 409 });
    }
    console.error("Pengajuan pinjaman gagal:", error);
    return NextResponse.json({ error: "Pengajuan pinjaman tidak dapat disimpan." }, { status: 500 });
  }
}
