import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hadir_session";
const SESSION_DURATION = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  name: string;
  role: "OWNER" | "EMPLOYEE";
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET wajib diisi minimal 32 karakter.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: SessionUser) {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secretKey());
}

export async function readSession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "OWNER" && payload.role !== "EMPLOYEE")
    ) {
      return null;
    }

    return {
      id: payload.sub,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION,
};
