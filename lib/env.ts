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
 *
 * 变量分两级：
 * - REQUIRED_ENV_KEYS：缺失会导致服务整体不可用（连不上库、无法签发会话）。
 * - OPTIONAL_FEATURE_ENV：只影响某一项能力。缺失时该功能不可用，但服务本身是健康的——
 *   例如 AI_API_KEY 在 Sprint 3 落地前本就为空，不应因此把容器判成 unhealthy。
 */

type EnvKey =
  | "DATABASE_URL"
  | "AUTH_SECRET"
  | "AI_BASE_URL"
  | "AI_API_KEY"
  | "AI_MODEL"
  | "AI_TIMEOUT_MS"
  | "AI_PROVIDER"
  | "AI_RATE_LIMIT_PER_MINUTE";

export type AiProvider = "openai" | "mock";

const HINTS: Record<EnvKey, string> = {
  DATABASE_URL:
    "PostgreSQL 连接串。本地 Docker 示例：postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public",
  AUTH_SECRET: "Auth.js 会话签名密钥。生成方式：openssl rand -base64 32",
  AI_BASE_URL: "OpenAI-compatible 接口地址。默认 DeepSeek：https://api.deepseek.com/v1",
  AI_API_KEY: "模型服务的 API Key。仅服务端使用，严禁添加 NEXT_PUBLIC_ 前缀。",
  AI_MODEL: "模型名称，例如 deepseek-chat",
  AI_TIMEOUT_MS: "AI 调用超时毫秒数，默认 30000",
  AI_PROVIDER:
    "AI 提供方：openai（默认，需 AI_API_KEY）或 mock（本地离线开发与冒烟用，不依赖外部服务）",
  AI_RATE_LIMIT_PER_MINUTE: "每个用户每分钟允许的 AI 调用次数，默认 10。本地冒烟可调小以复现限流",
};

/** 缺失即服务不可用 */
export const REQUIRED_ENV_KEYS: readonly EnvKey[] = ["DATABASE_URL", "AUTH_SECRET"];

/**
 * 按能力分组的可选变量：
 * - ai/openai 模式：需 AI_BASE_URL / AI_API_KEY / AI_MODEL，缺任意一项视为 AI 关闭。
 * - ai/mock 模式：无外部依赖，三项可全缺，AI 走本地预设样本（仅用于离线开发与冒烟）。
 */
export const OPTIONAL_FEATURE_ENV: ReadonlyArray<{ feature: string; keys: readonly EnvKey[] }> = [
  { feature: "ai", keys: ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"] },
];

export type DisabledFeature = { feature: string; missing: string[] };

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

/**
 * 返回因变量缺失而不可用的功能。
 *
 * mock 模式：AI_PROVIDER=mock 时不需要 AI_* 三件套，AI 视为可用。
 * 其它情况按整组判断：缺任意一项就视为该功能关闭，并列出具体缺哪几个。
 */
export function disabledFeatures(): DisabledFeature[] {
  const provider = rawValue("AI_PROVIDER");
  if (provider === "mock") return [];
  return OPTIONAL_FEATURE_ENV.flatMap(({ feature, keys }) => {
    const missing = keys.filter((key) => rawValue(key) === undefined);
    return missing.length > 0 ? [{ feature, missing }] : [];
  });
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
  /** AI 提供方：openai（默认，调真实 LLM）或 mock（本地离线 / 冒烟） */
  get AI_PROVIDER(): AiProvider {
    const value = rawValue("AI_PROVIDER");
    if (value === undefined || value === "openai") return "openai";
    if (value === "mock") return "mock";
    throw new Error(
      `[env] AI_PROVIDER 必须是 openai 或 mock，当前值：${JSON.stringify(value)}（${HINTS.AI_PROVIDER}）`
    );
  },
  /** AI 限流：每个用户每分钟允许次数。未配置时 10 次 */
  get AI_RATE_LIMIT_PER_MINUTE(): number {
    const value = rawValue("AI_RATE_LIMIT_PER_MINUTE");
    if (value === undefined) return 10;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `[env] AI_RATE_LIMIT_PER_MINUTE 必须是正整数，当前值：${JSON.stringify(value)}（${HINTS.AI_RATE_LIMIT_PER_MINUTE}）`
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
