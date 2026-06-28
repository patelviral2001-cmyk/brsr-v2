/**
 * Next.js edge middleware — protects every route that is not explicitly
 * public. We use NextAuth v5's `auth()` wrapper so the session cookie is
 * decoded on the edge and we can redirect unauthenticated requests to
 * /login with a `callbackUrl` round-trip.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";

const PUBLIC_PATHS = [
  "/login",
  "/sso-callback",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/static/")) return true;
  // Allow public assets (anything that looks like a file).
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export default auth(function middleware(req: NextRequest & { auth?: unknown }) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on every route except Next internals / static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
