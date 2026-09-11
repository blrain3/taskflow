/**
 * Server Action / Route Handler 的统一返回契约。
 * 依据 docs/architecture.md §7.2：可序列化，禁止把原始异常抛给客户端。
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "AI_INVALID_OUTPUT"
  | "AI_TIMEOUT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ActionError = {
  code: ErrorCode;
  /** 对外安全文案，不含内部细节 */
  message: string;
  /** 字段级错误：字段名 → 提示 */
  fields?: Record<string, string>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
