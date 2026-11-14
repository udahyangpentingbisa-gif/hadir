import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OwnerLoans, type OwnerLoanRow } from "@/components/owner-loans";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OwnerLoansPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "OWNER") redirect("/dashboard/employee");

  let loans: OwnerLoanRow[] = [];
  let loadError = false;
  try {
    const records = await prisma.loan.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true, username: true } },
        period: { select: { periodName: true } },
      },
    });
    loans = records.map((loan) => ({
      id: loan.id,
      amount: loan.amount,
      status: loan.status,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      employeeName: loan.user.name,
      username: loan.user.username,
      periodName: loan.period.periodName,
    }));
  } catch (error) {
    console.error("Gagal memuat daftar pinjaman owner:", error);
    loadError = true;
  }

  return (
    <div className="min-h-screen">
      <AppHeader name={session.name} role="OWNER" />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {loadError ? (
          <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Daftar pinjaman belum dapat dimuat.</p>
              <p className="mt-1">Periksa koneksi database atau coba muat ulang halaman.</p>
            </div>
          </div>
        ) : (
          <OwnerLoans initialLoans={loans} />
        )}
      </main>
    </div>
  );
}
