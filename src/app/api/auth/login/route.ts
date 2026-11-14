import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

const loginSchema = z.object({
  identity: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username/email dan kata sandi wajib diisi." }, { status: 400 });
  }

  try {
    const identity = parsed.data.identity.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: identity, mode: "insensitive" } },
          { email: { equals: identity, mode: "insensitive" } },
        ],
      },
    });
    if (!user || !(await compare(parsed.data.password, user.password))) {
      return NextResponse.json({ error: "Username/email atau kata sandi salah." }, { status: 401 });
    }

    const redirectTo = user.role === "OWNER" ? "/dashboard/owner" : "/dashboard/employee";
    const token = await createSession({ id: user.id, name: user.name, role: user.role });
    const response = NextResponse.json({ redirectTo });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Login gagal diproses:", error);
    return NextResponse.json(
      { error: "Layanan login belum siap. Periksa konfigurasi database dan AUTH_SECRET." },
      { status: 503 },
    );
  }
}
