import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "./session-token";
import type { SessionUser } from "./session-token";

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? readSession(token) : null;
}

export { createSession, SESSION_COOKIE, sessionCookieOptions } from "./session-token";
export type { SessionUser } from "./session-token";
