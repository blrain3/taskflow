import "server-only";

/**
 * 服务端环境变量契约（依据 docs/architecture.md §3.1）
 *
 * 规则：
 * 1. 任何以 AI_ 开头或含 SECRET / KEY 的变量，只能被 lib/ 下的服务端模块读取，
 *    不得出现在 Client Component 或 NEXT_PUBLIC_* 中。
 * 2. 变量缺失时给出可操作的报错，而不是让下游抛出难以定位的异常。
 * 3. 采用惰性读取（getter）：模块可被安全 import，只有真正使用某个变量时才校验，
 *    避免 `next build` 在没有 .env 的环境下整站失败。
 */

type EnvKey =
  "DATABASE_URL" | "AUTH_SECRET" | "AI_BASE_URL" | "AI_API_KEY" | "AI_MODEL" | "AI_TIMEOUT_MS";

const HINTS: Record<EnvKey, string> = {
  DATABASE_URL:
    "PostgreSQL 连接串。本地 Docker 示例：postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public",
  AUTH_SECRET: "Auth.js 会话签名密钥。生成方式：openssl rand -base64 32",
  AI_BASE_URL: "OpenAI-compatible 接口地址。默认 DeepSeek：https://api.deepseek.com/v1",
  AI_API_KEY: "模型服务的 API Key。仅服务端使用，严禁添加 NEXT_PUBLIC_ 前缀。",
  AI_MODEL: "模型名称，例如 deepseek-chat",
  AI_TIMEOUT_MS: "AI 调用超时毫秒数，默认 30000",
};

/** 必需变量清单，用于一次性报告缺失项（健康检查与开发提示） */
export const REQUIRED_ENV_KEYS: readonly EnvKey[] = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
];

function rawValue(key: EnvKey): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function read(key: EnvKey): string {
  const value = rawValue(key);
  if (value === undefined) {
    throw new Error(
      [
        `[env] 缺少必需的环境变量 ${key}`,
        `  修复步骤：`,
        `    1. 在项目根目录执行 cp .env.example .env`,
        `    2. 填写 ${key}`,
        `  该变量用途：${HINTS[key]}`,
      ].join("\n")
    );
  }
  return value;
}

/** 返回当前缺失的必需变量名列表；不抛错，供健康检查与启动自检使用 */
export function missingEnvKeys(): EnvKey[] {
  return REQUIRED_ENV_KEYS.filter((key) => rawValue(key) === undefined);
}

/** 惰性读取的服务端环境变量。任何访问都会在缺失时抛出带修复步骤的错误。 */
export const env = {
  get DATABASE_URL(): string {
    return read("DATABASE_URL");
  },
  get AUTH_SECRET(): string {
    return read("AUTH_SECRET");
  },
  get AI_BASE_URL(): string {
    return read("AI_BASE_URL");
  },
  get AI_API_KEY(): string {
    return read("AI_API_KEY");
  },
  get AI_MODEL(): string {
    return read("AI_MODEL");
  },
  /** AI 调用超时（毫秒）。未配置时回落到 30s。 */
  get AI_TIMEOUT_MS(): number {
    const value = rawValue("AI_TIMEOUT_MS");
    if (value === undefined) return 30_000;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `[env] AI_TIMEOUT_MS 必须是正整数毫秒数，当前值：${JSON.stringify(value)}（${HINTS.AI_TIMEOUT_MS}）`
      );
    }
    return parsed;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get isDevelopment(): boolean {
    return process.env.NODE_ENV !== "production";
  },
} as const;
