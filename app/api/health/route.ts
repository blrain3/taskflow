import { env, missingEnvKeys } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 健康检查。
 *
 * 用途：
 * - docker-compose 的 app healthcheck
 * - 部署后的人工/自动化冒烟验证（Sprint 0 出口条件：预览环境显示健康检查页）
 *
 * 语义：
 * - 200 ok       应用与数据库均可用
 * - 503 degraded 应用可响应，但环境变量缺失或数据库不可达（响应体会列出缺哪一项）
 */
export async function GET() {
  const missingEnv = missingEnvKeys();

  let database: "up" | "down" | "unconfigured" = "unconfigured";
  let databaseError: string | undefined;

  if (!missingEnv.includes("DATABASE_URL")) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "up";
    } catch (error) {
      database = "down";
      // 仅开发环境回传底层错误，生产环境避免泄露连接信息
      databaseError = env.isProduction
        ? "数据库连接失败，请检查 DATABASE_URL 与数据库服务状态"
        : error instanceof Error
          ? error.message
          : String(error);
    }
  }

  const healthy = missingEnv.length === 0 && database === "up";

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "taskflow",
      database,
      ...(databaseError ? { databaseError } : {}),
      missingEnv,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
