import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const actionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "REPAID"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Status pinjaman tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const loan = await prisma.$transaction(
      async (tx) => {
        const current = await tx.loan.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!current) throw new Error("LOAN_NOT_FOUND");
        const allowed =
          (current.status === "PENDING" &&
            (parsed.data.status === "APPROVED" || parsed.data.status === "REJECTED")) ||
          (current.status === "APPROVED" && parsed.data.status === "REPAID");
        if (!allowed) throw new Error("INVALID_LOAN_TRANSITION");

        return tx.loan.update({
          where: { id },
          data: { status: parsed.data.status },
          select: { id: true, status: true, updatedAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      loan: { ...loan, updatedAt: loan.updatedAt.toISOString() },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LOAN_NOT_FOUND") {
      return NextResponse.json({ error: "Pengajuan pinjaman tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_LOAN_TRANSITION") {
      return NextResponse.json({ error: "Perubahan status pinjaman tidak diizinkan." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Status pinjaman berubah bersamaan. Muat ulang halaman." }, { status: 409 });
    }
    console.error("Perubahan status pinjaman gagal:", error);
    return NextResponse.json({ error: "Status pinjaman tidak dapat diperbarui." }, { status: 500 });
  }
}
