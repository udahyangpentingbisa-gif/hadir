import { compare, hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password baru harus berisi 8 hingga 128 karakter." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { password: true, role: true },
    });
    if (!user || user.role !== "OWNER") {
      return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
    }
    if (!(await compare(parsed.data.currentPassword, user.password))) {
      return NextResponse.json({ error: "Password saat ini salah." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { password: await hash(parsed.data.newPassword, 12) },
    });
    return NextResponse.json({ message: "Password berhasil diubah." });
  } catch (error) {
    console.error("Gagal mengubah password owner:", error);
    return NextResponse.json({ error: "Password gagal diubah. Periksa koneksi database." }, { status: 500 });
  }
}
