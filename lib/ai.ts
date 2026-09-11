import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generatedSubtaskSchema } from "@/lib/validation";
import type { GeneratedSubtask } from "@/types/issue";

/**
 * AI 拆分任务（US-007 / P0-10）。
 *
 * 设计要点：
 * 1. AI 仅产出与校验，**不写库**——任何不合 Schema 的返回都抛 AI_INVALID_OUTPUT，
 *    上游路由转成 5xx，UI 提示「重新生成」，零数据库污染。
 * 2. Provider 由环境变量 AI_PROVIDER 决定：
 *    - openai：真实调用（@ai-sdk/openai + OpenAI-compatible base URL，DeepSeek / OpenAI 都行）；
 *    - mock：本地预设样本，专为离线开发与冒烟；prompt 含 "TIMEOUT" 触发超时分支、"INVALID" 触发无效输出分支。
 * 3. 超时：AbortController + generateText.abortSignal，超期抛 AI_TIMEOUT。
 * 4. 限流：按 userId 每分钟 AI_RATE_LIMIT_PER_MINUTE 次（滑动窗口，见 lib/rate-limit.ts）。
 *    **只对真正要调用上游的请求计数**，参数校验失败不占额度。
 * 5. 重试：仅对「传输层/上游 5xx」这类瞬时故障重试一次；超时与 Schema 不合**不重试**
 *    （重试超时只会让用户多等一个超时周期，重试无效输出等于放大错误）。
 * 6. Token 统计：真实调用取 SDK 的 usage；mock 按字符数估算，保证日志字段结构一致。
 * 7. AI_BASE_URL / AI_API_KEY / AI_MODEL 只在 lib/ 服务端模块可读，绝不出现在响应或日志值。
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 2;

export type BreakdownUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** mock 模式为估算值，真实调用为上游返回 */
  estimated: boolean;
};

export type BreakdownResult = {
  subtasks: GeneratedSubtask[];
  usage: BreakdownUsage;
  provider: "openai" | "mock";
  attempts: number;
};

/** 粗略估算：中文约 1 字 1 token，英文按 4 字符 1 token。仅用于 mock 与日志可观测性 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 2));
}

const SYSTEM_PROMPT = [
  "你是资深的任务拆解助手。用户会用自然语言描述一段工作。",
  "你需要把它拆成 3-10 条可独立执行的子任务。",
  '输出必须是 JSON 数组，数组里每项形如 {"title": "…", "description": "…"}。',
  "约束：title 长度 1-200 字符；description 可省略或留空字符串（不要写 null）；不要包含 markdown 或多余文字。",
].join("\n");

const USER_PROMPT_TEMPLATE = (prompt: string) =>
  `用户的输入：\n"""\n${prompt}\n"""\n\n按系统约束输出 JSON 数组。`;

const MOCK_SAMPLE: GeneratedSubtask[] = [
  { title: "梳理需求范围并列出验收标准", description: "与相关方对齐边界，落到 3-5 条可测标准" },
  { title: "设计数据结构与接口契约", description: "字段含义、状态流转、错误模型" },
  { title: "实现核心逻辑并补充冒烟", description: "覆盖正常路径 + 至少 1 条异常路径" },
];

async function callOpenAi(
  prompt: string,
  abortSignal: AbortSignal
): Promise<{ subtasks: GeneratedSubtask[]; usage: BreakdownUsage }> {
  const openai = createOpenAI({
    baseURL: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
  });

  const result = await generateText({
    model: openai.chat(env.AI_MODEL),
    system: SYSTEM_PROMPT,
    prompt: USER_PROMPT_TEMPLATE(prompt),
    abortSignal,
  });

  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;

  return {
    subtasks: parseAndValidateSubtasks(result.text),
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimated: false,
    },
  };
}

async function callMock(
  prompt: string,
  abortSignal: AbortSignal
): Promise<{ subtasks: GeneratedSubtask[]; usage: BreakdownUsage }> {
  // Mock 模式：prompt 关键字驱动分支，便于冒烟覆盖成功/超时/无效输出三类
  if (/TIMEOUT/i.test(prompt)) {
    // 一直等到超时控制真正 abort，从而走通「AbortController → AI_TIMEOUT」这条真实链路
    await new Promise<never>((_, reject) => {
      abortSignal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }

  if (/INVALID/i.test(prompt)) {
    // 故意返回无法被 Zod 解析的内容
    const subtasks = parseAndValidateSubtasks("这不是 JSON 输出");
    return { subtasks, usage: mockUsage(prompt, subtasks) };
  }

  return { subtasks: MOCK_SAMPLE, usage: mockUsage(prompt, MOCK_SAMPLE) };
}

function mockUsage(prompt: string, subtasks: GeneratedSubtask[]): BreakdownUsage {
  const completionText = JSON.stringify(subtasks);
  const promptTokens = estimateTokens(SYSTEM_PROMPT + prompt);
  const completionTokens = estimateTokens(completionText);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

/** 从模型输出文本里抠出 JSON 数组；解析失败/字段不合格一律抛 AI_INVALID_OUTPUT */
function parseAndValidateSubtasks(text: string): GeneratedSubtask[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 输出不含 JSON 数组" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "JSON 解析失败", cause: error });
  }

  if (!Array.isArray(parsed)) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 输出顶层不是数组" });
  }

  const subtasks: GeneratedSubtask[] = [];
  for (const item of parsed) {
    const result = generatedSubtaskSchema.safeParse(item);
    if (!result.success) {
      throw new AppError("AI_INVALID_OUTPUT", { detail: result.error.message });
    }
    subtasks.push({
      title: result.data.title,
      description: result.data.description ?? null,
    });
  }

  if (subtasks.length === 0) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 返回空数组" });
  }

  return subtasks;
}

/**
 * 拆分入口：限流 → 调用（含一次瞬时故障重试）→ 校验 → 记 Token。
 * @param userId 用于限流分桶；由调用方从会话推导，绝不接受客户端传入
 */
export async function breakdownSubtasks(prompt: string, userId: string): Promise<BreakdownResult> {
  if (prompt.trim().length < 10) {
    throw new AppError("VALIDATION_FAILED", { message: "请输入至少 10 个字符的描述" });
  }

  const provider = env.AI_PROVIDER;
  if (provider === "openai" && !env.AI_API_KEY) {
    throw new AppError("AI_DISABLED", { message: "AI 服务未启用：AI_API_KEY 未配置" });
  }

  // 限流放在参数校验之后、真正调用之前：无效请求不占额度
  consumeRateLimit({
    key: `ai:breakdown:${userId}`,
    limit: env.AI_RATE_LIMIT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const { subtasks, usage } =
        provider === "mock"
          ? await callMock(prompt, controller.signal)
          : await callOpenAi(prompt, controller.signal);

      // 日志只记 provider / 条数 / Token，绝不打印 prompt 内容（避免把用户输入意外送入日志）
      console.log(
        `[ai] breakdown ok provider=${provider} attempt=${attempt} subtasks=${subtasks.length} ` +
          `tokens(prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens} estimated=${usage.estimated})`
      );

      return { subtasks, usage, provider, attempts: attempt };
    } catch (error) {
      // 超时与输出不合规不重试：重试只会放大等待或重复放大错误
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("AI_TIMEOUT");
      }

      lastError = error;
      console.error(`[ai] 第 ${attempt} 次调用失败`, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new AppError("INTERNAL", { detail: "AI 调用异常", cause: lastError });
}

export type BatchCreateResult = {
  createdCount: number;
  /** true 表示这次请求命中了幂等键，未产生新数据 */
  duplicate: boolean;
};

/** Prisma 唯一约束冲突（P2002）。用于把并发重复提交收敛成「已创建」而不是 500 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * 批量事务创建（P0-11）。
 *
 * 幂等设计（不改 Schema，仍保持 ADR 冻结的六表模型）：
 * 用客户端提供的 requestId 推导确定性主键 `<requestId>:<index>`。因此
 * - 重复提交同一批次：主键已存在 → 事务内先查后建，直接返回既有结果，不产生重复任务；
 * - 并发重复提交：两条事务同时插入同一主键，落败方撞 P2002 → 读回既有结果返回，不报错；
 * - 事务中途失败：整批回滚（含已建记录），下次重试仍按同一批主键创建，不留半成品。
 *
 * 任务与批次的归属关系可由主键前缀还原（`<requestId>:`），无需额外关联表。
 */
export async function createIssuesFromSubtasks(params: {
  workspaceId: string;
  requestId: string;
  subtasks: GeneratedSubtask[];
}): Promise<BatchCreateResult> {
  const ids = params.subtasks.map((_, index) => `${params.requestId}:${index}`);
  const db = getPrisma();

  try {
    return await db.$transaction(async (tx) => {
      const existingCount = await tx.issue.count({
        where: { id: { in: ids }, workspaceId: params.workspaceId },
      });

      if (existingCount === ids.length) {
        return { createdCount: ids.length, duplicate: true };
      }
      if (existingCount > 0) {
        // 半批次存在理论上不会出现（事务原子性）；真出现就拒绝，避免产生难以追踪的数据
        throw new AppError("CONFLICT", { message: "该批次数据不完整，请刷新列表后重试" });
      }

      for (let index = 0; index < params.subtasks.length; index += 1) {
        const item = params.subtasks[index];
        await tx.issue.create({
          data: {
            id: ids[index],
            workspaceId: params.workspaceId,
            title: item.title,
            description: item.description ?? null,
            status: "BACKLOG",
            position: index * 100,
          },
        });
      }

      return { createdCount: params.subtasks.length, duplicate: false };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;

    // 并发落败或 requestId 撞上其它 Workspace 的既有主键：读回本批次结果，避免把 500 抛给用户
    if (isUniqueViolation(error)) {
      const count = await db.issue.count({
        where: { id: { in: ids }, workspaceId: params.workspaceId },
      });
      if (count === ids.length) {
        return { createdCount: ids.length, duplicate: true };
      }
      throw new AppError("CONFLICT", { message: "该批次标识已被占用，请重新生成子任务" });
    }

    throw error;
  }
}
