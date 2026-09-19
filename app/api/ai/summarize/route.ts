import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { assertDocumentAccess } from "@/lib/document-permissions";
import { getDocument } from "@/lib/documents";
import { AppError, messageFor } from "@/lib/errors";
import { summarizeDocumentContent } from "@/lib/ai";
import { aiSummarizeRequestSchema } from "@/lib/validation";
import type { ActionResult, ErrorCode } from "@/types/action";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/summarize
 *
 * Body: { documentId: string }
 *
 * 返回统一 ActionResult JSON（与 /api/ai/breakdown 同一套错误码 → 状态码映射）：
 * - 200 { ok: true, data: { summary, usage } }
 * - 400 VALIDATION_FAILED   缺少 documentId / 正文太短
 * - 401 UNAUTHORIZED        未登录
 * - 404 NOT_FOUND           文档不存在或不属于该账号的工作区
 * - 429 RATE_LIMITED        超过每分钟额度（与拆解共用限流器、独立分桶）
 * - 502 AI_INVALID_OUTPUT   上游返回空摘要
 * - 503 AI_DISABLED         未配置 AI_API_KEY
 * - 504 AI_TIMEOUT          上游超时
 *
 * 边界（architecture.md §6）：AI 只产出建议，**绝不写库**。写库由用户确认后的
 * `applyDocumentSummaryAction` 完成，这样建议在被采纳前不会污染文档。
 */

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

function jsonError(code: ErrorCode, message: string) {
  return NextResponse.json<ActionResult<never>>(
    { ok: false, error: { code, message } },
    { status: STATUS_BY_CODE[code] ?? 500 }
  );
}

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

  const parsed = aiSummarizeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "请求参数不合法");
  }

  try {
    // 授权拿到的 workspaceId 就是读取必须使用的工作区（授权与读取同源）
    const target = await assertDocumentAccess(user.id, parsed.data.documentId, "read");
    const document = await getDocument(parsed.data.documentId, target.workspaceId);
    if (!document) throw new AppError("NOT_FOUND");

    const result = await summarizeDocumentContent(document.content, user.id);
    return NextResponse.json<ActionResult<{ summary: string; provider: string }>>({
      ok: true,
      data: { summary: result.summary, provider: result.provider },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.code, error.message);
    }
    console.error("[ai] 摘要生成未预期异常", error);
    return jsonError("INTERNAL", messageFor("INTERNAL"));
  }
}
