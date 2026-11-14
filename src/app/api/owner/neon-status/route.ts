import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

type ServiceCheck = {
  status: "connected" | "unavailable" | "not_configured";
  message?: string;
};

async function checkDatabase(): Promise<ServiceCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected" };
  } catch (error) {
    console.error("Neon Postgres health check failed:", error);
    return { status: "unavailable", message: "Koneksi Postgres gagal." };
  }
}

async function checkAuth(): Promise<ServiceCheck> {
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl) return { status: "not_configured", message: "NEON_AUTH_JWKS_URL tidak tersedia." };
  try {
    const response = await fetch(jwksUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { status: "unavailable", message: `Auth JWKS merespons HTTP ${response.status}.` };
    }
    const document: unknown = await response.json();
    if (typeof document !== "object" || document === null || !("keys" in document) || !Array.isArray(document.keys)) {
      return { status: "unavailable", message: "Respons Auth JWKS tidak valid." };
    }
    return { status: "connected" };
  } catch (error) {
    console.error("Neon Auth health check failed:", error);
    return { status: "unavailable", message: "Endpoint Neon Auth tidak dapat dihubungi." };
  }
}

async function checkAiGateway(): Promise<ServiceCheck & { enabledModels?: number }> {
  const baseUrl = process.env.NEON_AI_GATEWAY_BASE_URL;
  const token = process.env.NEON_AI_GATEWAY_TOKEN;
  if (!baseUrl || !token) {
    return { status: "not_configured", message: "Kredensial AI Gateway belum tersedia." };
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { status: "unavailable", message: `AI Gateway merespons HTTP ${response.status}.` };
    }
    const document: unknown = await response.json();
    if (typeof document !== "object" || document === null || !("data" in document) || !Array.isArray(document.data)) {
      return { status: "unavailable", message: "Respons katalog AI Gateway tidak valid." };
    }
    const enabledModels = document.data.filter(
      (model) =>
        typeof model === "object" &&
        model !== null &&
        "enabled" in model &&
        model.enabled === true,
    ).length;
    return {
      status: "connected",
      enabledModels,
      ...(enabledModels === 0
        ? { message: "Belum ada model aktif; tambahkan kredit AI Gateway di Neon Billing." }
        : {}),
    };
  } catch (error) {
    console.error("Neon AI Gateway health check failed:", error);
    return { status: "unavailable", message: "Endpoint AI Gateway tidak dapat dihubungi." };
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  const [postgres, auth, aiGateway] = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkAiGateway(),
  ]);
  return NextResponse.json(
    {
      postgres,
      auth: {
        ...auth,
        message:
          auth.status === "connected"
            ? "Neon Auth aktif; login aplikasi tetap memakai sesi JWT yang sudah ada."
            : auth.message,
      },
      aiGateway,
      realtime:
        process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET
          ? { status: "configured" as const }
          : { status: "not_configured" as const },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
