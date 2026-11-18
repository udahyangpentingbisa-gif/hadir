export function calculateNetWage(
  grossWage: number,
  absenceDeduction: number,
  loanDeduction: number,
) {
  return Math.max(0, grossWage - absenceDeduction - loanDeduction);
}
