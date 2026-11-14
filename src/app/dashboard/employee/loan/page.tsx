import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EmployeeLoanPage } from "@/components/employee-loan-page";
import { LOAN_ELIGIBILITY_DAYS, MAX_OUTSTANDING_LOAN } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EmployeeLoanRoute() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "EMPLOYEE") redirect("/dashboard/owner");

  let pageData: {
    attendanceDays: number;
    periodName: string;
    loans: {
      id: string;
      amount: number;
      status: "PENDING" | "APPROVED" | "REJECTED" | "REPAID";
      createdAt: string;
      periodName: string;
    }[];
    outstanding: number;
  } | null = null;
  let loadError = false;

  try {
    const period = await prisma.payPeriod.findFirst({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
      select: { id: true, periodName: true },
    });
    if (period) {
      const attendanceDays = await prisma.attendance.count({
        where: { userId: session.id, periodId: period.id },
      });
      if (attendanceDays >= LOAN_ELIGIBILITY_DAYS) {
        const loans = await prisma.loan.findMany({
          where: { userId: session.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            period: { select: { periodName: true } },
          },
        });
        const outstanding = loans.reduce(
          (total, loan) =>
            loan.status === "PENDING" || loan.status === "APPROVED"
              ? total + loan.amount
              : total,
          0,
        );
        pageData = {
          attendanceDays,
          periodName: period.periodName,
          loans: loans.map((loan) => ({
            id: loan.id,
            amount: loan.amount,
            status: loan.status,
            createdAt: loan.createdAt.toISOString(),
            periodName: loan.period.periodName,
          })),
          outstanding,
        };
      }
    }
  } catch (error) {
    console.error("Gagal memuat halaman pinjaman karyawan:", error);
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="min-h-screen">
        <AppHeader name={session.name} role="EMPLOYEE" />
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
          <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Halaman pinjaman belum dapat dimuat.</p>
              <p className="mt-1">Periksa koneksi database atau coba muat ulang halaman.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!pageData) redirect("/dashboard/employee");

  return (
    <div className="min-h-screen">
      <AppHeader name={session.name} role="EMPLOYEE" />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <EmployeeLoanPage
          attendanceDays={pageData.attendanceDays}
          periodName={pageData.periodName}
          initialLoans={pageData.loans}
          initialOutstanding={pageData.outstanding}
          loanLimit={MAX_OUTSTANDING_LOAN}
        />
      </main>
    </div>
  );
}
