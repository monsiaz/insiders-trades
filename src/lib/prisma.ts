import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makePrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        // In serverless (Vercel), keep a small connection pool to avoid
        // saturating Neon's pooler. connection_limit=3 is safe for ISR.
        url: process.env.DATABASE_URL
          ? process.env.DATABASE_URL.includes("connection_limit")
            ? process.env.DATABASE_URL
            : `${process.env.DATABASE_URL}&connection_limit=3&pool_timeout=10`
          : process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
