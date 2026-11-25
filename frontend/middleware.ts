import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/watchlist",
  "/profile",
  "/savings",
  "/cart-optimizer",
  "/admin",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requiresAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!requiresAuth) {
    return NextResponse.next();
  }

  const refreshCookie = request.cookies.get("dealscout_refresh_token")?.value;
  const sessionCookie = request.cookies.get("dealscout_session")?.value;

  if (!refreshCookie && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/watchlist/:path*",
    "/profile/:path*",
    "/savings/:path*",
    "/cart-optimizer/:path*",
    "/admin/:path*",
  ],
};
