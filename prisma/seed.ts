import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await hash("admin123", 12);

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

  const activePeriod = await prisma.payPeriod.findFirst({
    where: { isActive: true },
  });

  if (!activePeriod) {
    const now = new Date();
    const year = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
      }).format(now),
    );
    const month = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Jakarta",
        month: "2-digit",
      }).format(now),
    );
    const day = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
      }).format(now),
    );
    const startDate = new Date(Date.UTC(year, month - 1, day));
    const endDate = new Date(Date.UTC(year, month - 1, day + 14));

    await prisma.payPeriod.create({
      data: {
        periodName: "Periode 1",
        startDate,
        endDate,
        isActive: true,
      },
    });
  }

  console.log("Seed selesai. Login awal: admin / admin123");
}

main()
  .catch((error: unknown) => {
    console.error("Seed database gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
