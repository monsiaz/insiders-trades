import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  return NextResponse.json(
    withMeta(
      {
        key: {
          id: ctx.key.id,
          name: ctx.key.name,
          prefix: ctx.key.prefix,
          scopes: ctx.key.scopes,
          totalRequests: ctx.key.totalRequests + 1, // include this one
        },
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          firstName: ctx.user.firstName,
          lastName: ctx.user.lastName,
          role: ctx.user.role,
        },
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ now: new Date() }) }
    )
  );
}
