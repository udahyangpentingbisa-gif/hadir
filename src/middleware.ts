import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "./lib/session-token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readSession(token) : null;

  if (pathname === "/login" && user) {
    return NextResponse.redirect(
      new URL(
        user.role === "OWNER" ? "/dashboard/owner" : "/dashboard/employee",
        request.url,
      ),
    );
  }

  if (!pathname.startsWith("/dashboard")) return NextResponse.next();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname === "/dashboard") {
    return NextResponse.redirect(
      new URL(
        user.role === "OWNER" ? "/dashboard/owner" : "/dashboard/employee",
        request.url,
      ),
    );
  }

  const ownerPath = pathname.startsWith("/dashboard/owner");
  const employeePath = pathname.startsWith("/dashboard/employee");
  if (
    (ownerPath && user.role !== "OWNER") ||
    (employeePath && user.role !== "EMPLOYEE")
  ) {
    return NextResponse.redirect(
      new URL(
        user.role === "OWNER" ? "/dashboard/owner" : "/dashboard/employee",
        request.url,
      ),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
