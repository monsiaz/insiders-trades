import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/auth/login?error=token_invalid", req.url));

  const user = await prisma.user.findUnique({ where: { verifyToken: token } });
  if (!user) return NextResponse.redirect(new URL("/auth/login?error=token_invalid", req.url));

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date(), verifyToken: null },
  });

  sendWelcomeEmail(user.email, user.name ?? "").catch(console.warn);

  return NextResponse.redirect(new URL("/portfolio?verified=1", req.url));
}
