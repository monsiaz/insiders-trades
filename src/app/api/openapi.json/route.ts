import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi-spec";

export const revalidate = 300;

export async function GET() {
  return NextResponse.json(buildOpenApiSpec(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
