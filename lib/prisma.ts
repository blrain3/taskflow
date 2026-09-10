import "server-only";

import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * Prisma Client 单例。
 *
 * 为什么需要单例：Next.js 开发模式会热重载模块，若每次都 new PrismaClient()
 * 会累积数据库连接直到连接池耗尽。
 *
 * 连接串显式取自 lib/env.ts，好处是缺失 DATABASE_URL 时抛出的是带修复步骤的错误，
 * 而不是 Prisma 内部的 P1012 校验失败。
 */

const globalForPrisma = globalThis as unknown as { __taskflowPrisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: env.isProduction ? ["error"] : ["warn", "error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__taskflowPrisma ?? createPrismaClient();

if (!env.isProduction) {
  globalForPrisma.__taskflowPrisma = prisma;
}
