import "server-only";

import type { ActionError, ErrorCode } from "@/types/action";

/**
 * 统一错误模型（docs/architecture.md §11）。
 *
 * 原则：
 * 1. 对外只暴露安全文案，内部细节只进服务端日志。
 * 2. 领域层抛 AppError，应用服务层用 toActionResult() 收敛成可序列化结果。
 * 3. 未知异常一律降级为 INTERNAL，绝不把堆栈或数据库错误透给浏览器。
 */

const SAFE_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "请先登录后再操作",
  FORBIDDEN: "没有权限访问该资源",
  VALIDATION_FAILED: "输入内容不合法，请检查后重试",
  NOT_FOUND: "目标不存在或已被删除",
  CONFLICT: "该数据已存在",
  AI_DISABLED: "AI 功能未启用，请在服务端配置 AI_API_KEY",
  AI_INVALID_OUTPUT: "AI 返回结果无法解析，请重新生成",
  AI_TIMEOUT: "AI 响应超时，请重试",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  INTERNAL: "服务暂时不可用，请稍后重试",
};

type AppErrorOptions = {
  message?: string;
  fields?: Record<string, string>;
  /** 仅用于服务端日志 */
  detail?: unknown;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly detail?: unknown;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? SAFE_MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fields = options.fields;
    this.detail = options.detail;
  }
}

/** 成功结果 */
export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/**
 * 把任意异常收敛为 ActionResult。
 * 只有 AppError 的 code / message / fields 会被下发；其余情况记日志后返回 INTERNAL。
 */
export function toActionError(error: unknown): ActionError {
  if (error instanceof AppError) {
    if (error.code === "INTERNAL" || error.detail !== undefined) {
      console.error(`[action-error] ${error.code}`, error.detail ?? error.cause ?? error.message);
    }
    return {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    };
  }

  console.error("[action-error] 未预期异常", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "non-error value",
  });
  return { code: "INTERNAL", message: SAFE_MESSAGES.INTERNAL };
}

export function toActionResult(error: unknown): { ok: false; error: ActionError } {
  return { ok: false, error: toActionError(error) };
}

export function messageFor(code: ErrorCode): string {
  return SAFE_MESSAGES[code];
}
