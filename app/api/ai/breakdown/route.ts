import { NextResponse } from "next/server";

import { breakdownSubtasks } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { AppError, messageFor } from "@/lib/errors";
import { aiBreakdownRequestSchema } from "@/lib/validation";
import type { ActionResult, ErrorCode } from "@/types/action";
import type { GeneratedSubtask } from "@/types/issue";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/breakdown
 *
 * Body: { prompt: string }（去除首尾空白后 10-4000 字符）
 *
 * 返回统一 ActionResult JSON：
 * - 200 { ok: true, data: { subtasks, usage } }
 * - 400 { ok: false, error: { code: "VALIDATION_FAILED" } }   入参不合法
 * - 401 { ok: false, error: { code: "UNAUTHORIZED" } }        未登录
 * - 429 { ok: false, error: { code: "RATE_LIMITED" } }        超过每分钟额度
 * - 502 { ok: false, error: { code: "AI_INVALID_OUTPUT" } }   上游返回无法解析
 * - 503 { ok: false, error: { code: "AI_DISABLED" } }         未配置 AI_API_KEY
 * - 504 { ok: false, error: { code: "AI_TIMEOUT" } }          上游超时
 *
 * AI 仅返回与校验；绝不写库——任何不合 Schema 的输出直接 AI_INVALID_OUTPUT 上抛。
 */

/** 错误码 → HTTP 状态码。用 502/504 区分「上游给了垃圾」与「上游太慢」，便于排障与前端分支 */
const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AI_DISABLED: 503,
  AI_INVALID_OUTPUT: 502,
  AI_TIMEOUT: 504,
  INTERNAL: 500,
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("UNAUTHORIZED", messageFor("UNAUTHORIZED"));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("VALIDATION_FAILED", "请求体必须是 JSON");
  }

  const parsed = aiBreakdownRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "请求参数不合法");
  }

  try {
    const result = await breakdownSubtasks(parsed.data.prompt, user.id);
    return NextResponse.json<
      ActionResult<{ subtasks: GeneratedSubtask[]; usage: typeof result.usage }>
    >({
      ok: true,
      data: { subtasks: result.subtasks, usage: result.usage },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.code, error.message);
    }
    console.error("[ai] 未预期异常", error);
    return jsonError("INTERNAL", messageFor("INTERNAL"));
  }
}

function jsonError(code: ErrorCode, message: string) {
  return NextResponse.json<ActionResult<never>>(
    { ok: false, error: { code, message } },
    { status: STATUS_BY_CODE[code] ?? 500 }
  );
}
