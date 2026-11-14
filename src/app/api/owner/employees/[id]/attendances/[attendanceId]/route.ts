import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; attendanceId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const { id, attendanceId } = await context.params;
  try {
    const record = await prisma.attendance.findFirst({
      where: { id: attendanceId, userId: id, period: { isActive: true } },
      select: { id: true },
    });
    if (!record) return NextResponse.json({ error: "Catatan absensi aktif tidak ditemukan." }, { status: 404 });
    await prisma.attendance.delete({ where: { id: attendanceId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Penghapusan koreksi absensi gagal:", error);
    return NextResponse.json({ error: "Catatan absensi tidak dapat dihapus." }, { status: 500 });
  }
}
