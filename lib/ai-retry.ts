import { AppError } from "@/lib/errors";

/** 只允许明确的瞬时故障重试，认证/参数类错误不应重复消耗上游额度。 */
export function isRetryableAiError(error: unknown): boolean {
  if (error instanceof AppError) return false;
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: unknown }).status;
  if (typeof status === "number") return status >= 500 && status <= 599;
  const code = (error as Error & { code?: unknown }).code;
  return code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT";
}
