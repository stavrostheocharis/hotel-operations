import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic sign-in check: no session cookie → straight to /sign-in. The
 * cookie is not validated here (that is requireViewer()'s job, inside the
 * page), so a stale cookie reaches the page, which redirects with
 * ?expired=1. This never redirects away from /sign-in, or a stale cookie
 * would loop.
 */
const SESSION_COOKIE = "oem_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = `${url.pathname}${url.search}`;
  url.pathname = "/sign-in";
  url.search = next === "/" || next === "/today" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!sign-in|api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
