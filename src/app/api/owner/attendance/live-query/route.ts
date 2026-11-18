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
  loanDeduction: number;
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
      `WITH active_periods AS (
         SELECT id, employee_id
         FROM pay_periods
         WHERE is_active = TRUE
       ),
       attendance_totals AS (
         SELECT
           period_id,
           user_id,
           COUNT(*)::int AS attendance_count,
           SUM(wage_earned)::int AS wage_total
         FROM attendances
         GROUP BY period_id, user_id
       ),
       deduction_totals AS (
         SELECT
           period_id,
           user_id,
           SUM(salary_deduction)::int AS deduction_total
         FROM absence_reports
         GROUP BY period_id, user_id
       ),
       loan_totals AS (
         SELECT
           period_id,
           user_id,
           SUM(amount)::int AS loan_total
         FROM loans
         WHERE status = 'APPROVED'
         GROUP BY period_id, user_id
       )
       SELECT
         users.id,
         users.name,
         users.username,
         users.email,
         COALESCE(attendance_totals.attendance_count, 0)::int AS "attendanceCount",
         COALESCE(loan_totals.loan_total, 0)::int AS "loanDeduction",
         GREATEST(
           COALESCE(attendance_totals.wage_total, 0)
             - COALESCE(deduction_totals.deduction_total, 0)
             - COALESCE(loan_totals.loan_total, 0),
           0
         )::int AS "wageTotal",
         COUNT(DISTINCT today_attendances.id)::int > 0 AS "attendedToday"
       FROM users
       LEFT JOIN active_periods ON active_periods.employee_id = users.id
       LEFT JOIN attendance_totals
         ON attendance_totals.user_id = users.id
        AND attendance_totals.period_id = active_periods.id
       LEFT JOIN deduction_totals
         ON deduction_totals.user_id = users.id
        AND deduction_totals.period_id = active_periods.id
       LEFT JOIN loan_totals
         ON loan_totals.user_id = users.id
        AND loan_totals.period_id = active_periods.id
       LEFT JOIN attendances AS today_attendances
         ON today_attendances.user_id = users.id
        AND today_attendances.date = $1::date
       WHERE users.role = 'EMPLOYEE'
       GROUP BY
         users.id,
         attendance_totals.attendance_count,
         attendance_totals.wage_total,
         deduction_totals.deduction_total,
         loan_totals.loan_total
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
