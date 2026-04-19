import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "insiders-trades-secret-change-in-production"
);

const PROTECTED = ["/portfolio"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get("it_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, req.url));
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, req.url));
    res.cookies.delete("it_session");
    return res;
  }
}

export const config = {
  matcher: ["/portfolio/:path*"],
};
