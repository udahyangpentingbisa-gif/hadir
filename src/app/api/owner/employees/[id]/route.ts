import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  password: z.string().max(128).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.password && parsed.data.password.length < 8)) {
    return NextResponse.json({ error: "Data tidak valid. Kata sandi baru minimal 8 karakter." }, { status: 400 });
  }

  try {
    const employee = await prisma.user.update({
      where: { id, role: "EMPLOYEE" },
      data: {
        name: parsed.data.name,
        username: parsed.data.username.toLowerCase(),
        email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
        ...(parsed.data.password ? { password: await hash(parsed.data.password, 12) } : {}),
      },
      select: { id: true, name: true, username: true, email: true },
    });
    return NextResponse.json({ employee });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Username atau email sudah digunakan." }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Akun karyawan tidak ditemukan." }, { status: 404 });
    }
    console.error("Gagal memperbarui akun karyawan:", error);
    return NextResponse.json({ error: "Perubahan akun gagal disimpan." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const { id } = await context.params;
  try {
    await prisma.$transaction(
      async (tx) => {
        const employee = await tx.user.findFirst({
          where: { id, role: "EMPLOYEE" },
          select: { id: true },
        });
        if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
        const activeLoan = await tx.loan.findFirst({
          where: { userId: id, status: { in: ["PENDING", "APPROVED"] } },
          select: { id: true },
        });
        if (activeLoan) throw new Error("ACTIVE_LOAN");
        await tx.user.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_LOAN") {
      return NextResponse.json(
        { error: "Karyawan tidak dapat dihapus selama pinjaman masih menunggu persetujuan atau belum lunas." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return NextResponse.json({ error: "Akun karyawan tidak ditemukan." }, { status: 404 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Akun karyawan tidak ditemukan." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Data karyawan berubah bersamaan. Muat ulang dan coba lagi." }, { status: 409 });
    }
    console.error("Gagal menghapus akun karyawan:", error);
    return NextResponse.json({ error: "Akun karyawan gagal dihapus." }, { status: 500 });
  }
}
