import { disabledFeatures, env, missingEnvKeys } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 健康检查。
 *
 * 用途：
 * - docker-compose 的 app healthcheck
 * - 部署后的人工/自动化冒烟验证
 *
 * 语义：
 * - 200 ok       必需变量齐备且数据库可达
 * - 503 degraded 必需变量缺失或数据库不可达（响应体列出缺哪一项）
 *
 * 注意区分「必需」与「可选功能」：AI_* 未配置只代表 AI 能力关闭（Sprint 3 才落地），
 * 属于正常状态，不能让容器一直处于 unhealthy，否则 depends_on: service_healthy 会失效。
 */
export async function GET() {
  const missingEnv = missingEnvKeys();
  const disabled = disabledFeatures();

  let database: "up" | "down" | "unconfigured" = "unconfigured";
  let databaseError: string | undefined;

  if (!missingEnv.includes("DATABASE_URL")) {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
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
      disabledFeatures: disabled.map((item) => item.feature),
      ...(disabled.length > 0 ? { disabledFeatureDetails: disabled } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
