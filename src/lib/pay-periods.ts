import { Prisma } from "@prisma/client";
import { dateFromKey, jakartaDateKey } from "@/lib/dates";
import { PERIOD_ATTENDANCE_LIMIT } from "@/lib/format";

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function getActivePayPeriod(
  tx: Prisma.TransactionClient,
  employeeId: string,
  startDate = dateFromKey(jakartaDateKey()),
) {
  const activePeriod = await tx.payPeriod.findFirst({
    where: { employeeId, isActive: true },
    orderBy: { startDate: "desc" },
  });
  if (activePeriod) return activePeriod;

  const count = await tx.payPeriod.count({ where: { employeeId } });
  return tx.payPeriod.create({
    data: {
      employeeId,
      periodName: `Siklus ${count + 1}`,
      startDate,
      endDate: addDays(startDate, PERIOD_ATTENDANCE_LIMIT - 1),
      isActive: true,
    },
  });
}

export async function getOpenPayPeriod(
  tx: Prisma.TransactionClient,
  employeeId: string,
  startDate = dateFromKey(jakartaDateKey()),
) {
  let period = await getActivePayPeriod(tx, employeeId, startDate);
  let attendanceCount = await tx.attendance.count({
    where: { userId: employeeId, periodId: period.id },
  });

  while (attendanceCount >= PERIOD_ATTENDANCE_LIMIT) {
    const lastAttendance = await tx.attendance.findFirst({
      where: { userId: employeeId, periodId: period.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { date: true },
    });
    if (!lastAttendance) throw new Error("PERIOD_ATTENDANCE_INCONSISTENT");

    period = await advancePayPeriod(tx, period.id, employeeId, lastAttendance.date);
    attendanceCount = 0;
  }

  return { period, attendanceCount };
}

export async function advancePayPeriod(
  tx: Prisma.TransactionClient,
  periodId: string,
  employeeId: string,
  lastAttendanceDate: Date,
) {
  const nextStartDate = addDays(lastAttendanceDate, 1);
  await tx.payPeriod.update({
    where: { id: periodId, employeeId, isActive: true },
    data: { isActive: false, endDate: lastAttendanceDate },
  });
  const count = await tx.payPeriod.count({ where: { employeeId } });
  return tx.payPeriod.create({
    data: {
      employeeId,
      periodName: `Siklus ${count + 1}`,
      startDate: nextStartDate,
      endDate: addDays(nextStartDate, PERIOD_ATTENDANCE_LIMIT - 1),
      isActive: true,
    },
  });
}

export function isLeaveDay(date: Date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 4;
}
