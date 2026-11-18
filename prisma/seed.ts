import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { getActivePayPeriod } from "../src/lib/pay-periods";

const prisma = new PrismaClient();

async function main() {
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword || initialPassword.length < 8 || initialPassword.length > 128) {
    throw new Error("ADMIN_INITIAL_PASSWORD wajib diisi 8 hingga 128 karakter sebelum menjalankan seed.");
  }
  const password = await hash(initialPassword, 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Administrator",
      username: "admin",
      password,
      role: Role.OWNER,
    },
  });

  const employees = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE },
    select: { id: true },
  });
  for (const employee of employees) {
    await prisma.$transaction((tx) => getActivePayPeriod(tx, employee.id));
  }

  console.log("Seed selesai; akun owner dibuat hanya jika belum tersedia.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed database gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
