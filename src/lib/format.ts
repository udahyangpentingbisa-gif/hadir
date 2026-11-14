export const DAILY_WAGE = 50_000;
export const PERIOD_ATTENDANCE_LIMIT = 15;
export const LOAN_ELIGIBILITY_DAYS = 10;
export const MAX_OUTSTANDING_LOAN = 300_000;

export function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
