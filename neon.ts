import { defineConfig } from "@neon/config/v1";

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);
for (const value of [
  process.env.NEON_APP_ORIGIN,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
]) {
  if (!value) continue;
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  allowedOrigins.add(url.origin);
}

export default defineConfig({
  // Declare your Neon services here
  preview: {
    realtime: {
      allowedOrigins: [...allowedOrigins],
    },
  },
  auth: true,
  aiGateway: true,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
