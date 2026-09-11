import "server-only";

import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * Prisma Client 单例。
 *
 * 为什么不是模块级常量：DATABASE_URL 属于运行时配置，lib/env.ts 的校验刻意做成惰性的。
 * 若在模块加载期就构造客户端，`next build` 的「Collecting page data」阶段会读取
 * DATABASE_URL 并直接构建失败——而构建环境（Docker build 阶段、CI）本来就不该持有数据库凭据。
 * 因此改为首次使用时才构造。
 *
 * 为什么需要单例：Next.js 开发模式会热重载模块，重复 new 会累积连接直到连接池耗尽。
 */

const globalForPrisma = globalThis as unknown as { __taskflowPrisma?: PrismaClient };

let cachedClient: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: env.isProduction ? ["error"] : ["warn", "error"],
  });
}

/** 取得 Prisma Client 单例。首次调用时才读取 DATABASE_URL 并建立客户端。 */
export function getPrisma(): PrismaClient {
  if (cachedClient) return cachedClient;

  const existing = globalForPrisma.__taskflowPrisma;
  if (existing) {
    cachedClient = existing;
    return cachedClient;
  }

  const created = createPrismaClient();
  if (!env.isProduction) {
    globalForPrisma.__taskflowPrisma = created;
  }
  cachedClient = created;
  return cachedClient;
}
