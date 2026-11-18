import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node --env-file-if-exists=.env.local --import tsx prisma/seed.ts",
  },
});
