import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      shaFull: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      deployedAt: process.env.VERCEL_DEPLOYMENT_ID ?? "local",
      env: process.env.VERCEL_ENV ?? "development",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
