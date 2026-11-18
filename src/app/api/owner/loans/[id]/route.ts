import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dateFromKey } from "@/lib/dates";
import { MAX_OUTSTANDING_LOAN } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const editSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "REPAID"]).optional(),
  amount: z.number().int().min(1).max(MAX_OUTSTANDING_LOAN).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    return NextResponse.json({ error: "Perubahan pinjaman tidak valid." }, { status: 400 });
  }
  const createdAt = parsed.data.date ? dateFromKey(parsed.data.date) : undefined;
  if (createdAt && createdAt.toISOString().slice(0, 10) !== parsed.data.date) {
    return NextResponse.json({ error: "Tanggal pinjaman tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const loan = await prisma.$transaction(
      async (tx) => {
        const current = await tx.loan.findUnique({
          where: { id },
          select: { status: true, userId: true },
        });
        if (!current) throw new Error("LOAN_NOT_FOUND");
        if (parsed.data.periodId) {
          const period = await tx.payPeriod.findFirst({
            where: { id: parsed.data.periodId, employeeId: current.userId },
            select: { id: true },
          });
          if (!period) throw new Error("PERIOD_NOT_FOUND");
        }

        return tx.loan.update({
          where: { id },
          data: {
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
            ...(parsed.data.amount ? { amount: parsed.data.amount } : {}),
            ...(createdAt ? { createdAt } : {}),
            ...(parsed.data.periodId ? { periodId: parsed.data.periodId } : {}),
          },
          select: { id: true, amount: true, status: true, periodId: true, createdAt: true, updatedAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      loan: {
        ...loan,
        createdAt: loan.createdAt.toISOString(),
        updatedAt: loan.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LOAN_NOT_FOUND") {
      return NextResponse.json({ error: "Pengajuan pinjaman tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PERIOD_NOT_FOUND") {
      return NextResponse.json({ error: "Siklus karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Status pinjaman berubah bersamaan. Muat ulang halaman." }, { status: 409 });
    }
    console.error("Perubahan status pinjaman gagal:", error);
    return NextResponse.json({ error: "Status pinjaman tidak dapat diperbarui." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const { id } = await context.params;
  try {
    const deleted = await prisma.loan.deleteMany({ where: { id } });
    if (deleted.count === 0) return NextResponse.json({ error: "Pinjaman tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Penghapusan pinjaman gagal:", error);
    return NextResponse.json({ error: "Pinjaman tidak dapat dihapus." }, { status: 500 });
  }
}
