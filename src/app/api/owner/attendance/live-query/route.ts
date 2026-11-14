import { createRealtime, rawSql } from "@neon/realtime/server";
import { NextResponse } from "next/server";
import { jakartaDateKey } from "@/lib/dates";
import { getSession } from "@/lib/session";

type LiveEmployeeRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  attendanceCount: number;
  wageTotal: number;
  attendedToday: boolean;
};

function getRealtimeServer() {
  const secret = process.env.NEON_REALTIME_SECRET;
  const connectionString = process.env.DATABASE_URL;
  if (!secret || !connectionString) {
    throw new Error("Realtime membutuhkan NEON_REALTIME_SECRET dan DATABASE_URL.");
  }
  const database = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!database) throw new Error("Nama database tidak ditemukan di DATABASE_URL.");
  return createRealtime({ secret, db: database });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });

  try {
    const query = rawSql<LiveEmployeeRow>(
      `WITH active_period AS (
         SELECT id
         FROM pay_periods
         WHERE is_active = TRUE
         ORDER BY start_date DESC
         LIMIT 1
       )
       SELECT
         users.id,
         users.name,
         users.username,
         users.email,
         COUNT(DISTINCT attendances.id)::int AS "attendanceCount",
         COALESCE(SUM(attendances.wage_earned), 0)::int AS "wageTotal",
         COUNT(DISTINCT today_attendances.id)::int > 0 AS "attendedToday"
       FROM users
       LEFT JOIN active_period ON TRUE
       LEFT JOIN attendances
         ON attendances.user_id = users.id
        AND attendances.period_id = active_period.id
       LEFT JOIN attendances AS today_attendances
         ON today_attendances.user_id = users.id
        AND today_attendances.date = $1::date
       WHERE users.role = 'EMPLOYEE'
       GROUP BY users.id
       ORDER BY users.name`,
      [jakartaDateKey()],
    );
    const sealedQuery = await getRealtimeServer().seal({ query });
    return NextResponse.json(
      { sealedQuery },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Gagal menyiapkan live query absensi:", error);
    return NextResponse.json(
      { error: "Live update absensi belum tersedia." },
      { status: 503 },
    );
  }
}
