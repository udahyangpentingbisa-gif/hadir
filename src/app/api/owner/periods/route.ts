import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  const requestedName =
    typeof body === "object" && body !== null && "periodName" in body && typeof body.periodName === "string"
      ? body.periodName.trim().slice(0, 60)
      : "";
  const todayKey = jakartaDateKey();
  const startDate = dateFromKey(todayKey);
  const [year, month, day] = todayKey.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day + 14));

  try {
    const period = await prisma.$transaction(
      async (tx) => {
        await tx.payPeriod.updateMany({ where: { isActive: true }, data: { isActive: false } });
        const previousCount = await tx.payPeriod.count();
        return tx.payPeriod.create({
          data: {
            periodName: requestedName || `Periode ${previousCount + 1}`,
            startDate,
            endDate,
            isActive: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ period: { id: period.id, periodName: period.periodName } }, { status: 201 });
  } catch (error) {
    console.error("Gagal memulai periode baru:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Periode sedang diperbarui. Muat ulang dan coba lagi." }, { status: 409 });
    }
    return NextResponse.json({ error: "Periode baru gagal dibuat." }, { status: 500 });
  }
}
