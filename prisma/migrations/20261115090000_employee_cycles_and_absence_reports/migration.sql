CREATE TYPE "AbsenceKind" AS ENUM ('LEAVE', 'EXPLANATION');
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "pay_periods" ADD COLUMN "employee_id" TEXT;

CREATE TEMP TABLE "period_employee_map" AS
SELECT
    periods."id" AS "old_period_id",
    users."id" AS "employee_id",
    md5(periods."id" || ':' || users."id") AS "new_period_id"
FROM "pay_periods" AS periods
CROSS JOIN "users" AS users;

INSERT INTO "pay_periods" (
    "id",
    "employee_id",
    "period_name",
    "start_date",
    "end_date",
    "is_active",
    "created_at"
)
SELECT
    mapping."new_period_id",
    mapping."employee_id",
    periods."period_name",
    periods."start_date",
    periods."end_date",
    periods."is_active",
    periods."created_at"
FROM "period_employee_map" AS mapping
JOIN "pay_periods" AS periods ON periods."id" = mapping."old_period_id";

UPDATE "attendances" AS attendance
SET "period_id" = mapping."new_period_id"
FROM "period_employee_map" AS mapping
WHERE attendance."period_id" = mapping."old_period_id"
  AND attendance."user_id" = mapping."employee_id";

UPDATE "loans" AS loan
SET "period_id" = mapping."new_period_id"
FROM "period_employee_map" AS mapping
WHERE loan."period_id" = mapping."old_period_id"
  AND loan."user_id" = mapping."employee_id";

DELETE FROM "pay_periods" WHERE "employee_id" IS NULL;

ALTER TABLE "pay_periods" ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "pay_periods"
    ADD CONSTRAINT "pay_periods_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "pay_periods_employee_id_is_active_idx"
    ON "pay_periods"("employee_id", "is_active");

WITH ranked_active_periods AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "employee_id"
            ORDER BY "start_date" DESC, "created_at" DESC, "id" DESC
        ) AS "position"
    FROM "pay_periods"
    WHERE "is_active" = TRUE
)
UPDATE "pay_periods"
SET "is_active" = FALSE
WHERE "id" IN (
    SELECT "id" FROM ranked_active_periods WHERE "position" > 1
);

INSERT INTO "pay_periods" (
    "id",
    "employee_id",
    "period_name",
    "start_date",
    "end_date",
    "is_active",
    "created_at"
)
SELECT
    md5(users."id" || ':initial-cycle'),
    users."id",
    'Siklus ' || (
        SELECT COUNT(*) + 1
        FROM "pay_periods" AS previous_periods
        WHERE previous_periods."employee_id" = users."id"
    ),
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date + 14,
    TRUE,
    CURRENT_TIMESTAMP
FROM "users" AS users
WHERE users."role" = 'EMPLOYEE'
  AND NOT EXISTS (
      SELECT 1
      FROM "pay_periods" AS periods
      WHERE periods."employee_id" = users."id"
        AND periods."is_active" = TRUE
  );

CREATE TEMP TABLE "completed_active_cycles" AS
SELECT
    periods."id" AS "period_id",
    periods."employee_id",
    MAX(attendances."date") AS "last_attendance_date",
    (
        SELECT COUNT(*) + 1
        FROM "pay_periods" AS previous_periods
        WHERE previous_periods."employee_id" = periods."employee_id"
    ) AS "next_cycle_number"
FROM "pay_periods" AS periods
JOIN "attendances" AS attendances
    ON attendances."period_id" = periods."id"
   AND attendances."user_id" = periods."employee_id"
WHERE periods."is_active" = TRUE
GROUP BY periods."id", periods."employee_id"
HAVING COUNT(*) >= 15;

UPDATE "pay_periods" AS periods
SET "is_active" = FALSE,
    "end_date" = completed."last_attendance_date"
FROM "completed_active_cycles" AS completed
WHERE periods."id" = completed."period_id";

CREATE UNIQUE INDEX "pay_periods_one_active_per_employee_key"
    ON "pay_periods"("employee_id") WHERE "is_active" = TRUE;

INSERT INTO "pay_periods" (
    "id",
    "employee_id",
    "period_name",
    "start_date",
    "end_date",
    "is_active",
    "created_at"
)
SELECT
    md5(completed."period_id" || ':rollover'),
    completed."employee_id",
    'Siklus ' || completed."next_cycle_number",
    completed."last_attendance_date" + 1,
    completed."last_attendance_date" + 15,
    TRUE,
    CURRENT_TIMESTAMP
FROM "completed_active_cycles" AS completed;

CREATE TABLE "absence_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AbsenceKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    CONSTRAINT "absence_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "absence_reports_user_id_date_key"
    ON "absence_reports"("user_id", "date");
CREATE INDEX "absence_reports_period_id_status_idx"
    ON "absence_reports"("period_id", "status");
CREATE UNIQUE INDEX "absence_reports_one_leave_per_period_key"
    ON "absence_reports"("period_id")
    WHERE "kind" = 'LEAVE' AND "status" IN ('PENDING', 'APPROVED');

ALTER TABLE "absence_reports"
    ADD CONSTRAINT "absence_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "absence_reports"
    ADD CONSTRAINT "absence_reports_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "pay_periods"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
