import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActivePayPeriod } from "@/lib/pay-periods";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const employeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const parsed = employeeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Lengkapi nama, username, dan kata sandi minimal 8 karakter." }, { status: 400 });
  }
  try {
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          username: parsed.data.username.toLowerCase(),
          email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
          password: await hash(parsed.data.password, 12),
          role: "EMPLOYEE",
        },
        select: { id: true, name: true, username: true, email: true },
      });
      await getActivePayPeriod(tx, created.id);
      return created;
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Username atau email sudah digunakan." }, { status: 409 });
    }
    console.error("Gagal membuat akun karyawan:", error);
    return NextResponse.json({ error: "Akun karyawan gagal dibuat." }, { status: 500 });
  }
}
