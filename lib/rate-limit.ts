import "server-only";

import { AppError } from "@/lib/errors";

/**
 * 单实例内存滑动窗口限流（P0-10 要求「限流」）。
 *
 * 语义：同一 key（此处为 userId）在 windowMs 内最多允许 limit 次调用，超限抛 RATE_LIMITED。
 *
 * 为什么用内存：MVP 单容器部署，无需引入 Redis。代价是**多实例水平扩展时计数不共享**，
 * 届时把 store 换成 Redis（INCR + EXPIRE）即可，函数签名不变。
 *
 * 为什么是滑动窗口而不是固定窗口：固定窗口在切换瞬间会放行约 2 倍流量，滑动窗口没有该尖峰。
 */

const buckets = new Map<string, number[]>();

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

/** 记录一次调用；超限抛 RATE_LIMITED（文案带剩余等待秒数，便于前端提示） */
export function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions): void {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= limit) {
    const retryAfterMs = Math.max(0, recent[0] + windowMs - now);
    buckets.set(key, recent);
    throw new AppError("RATE_LIMITED", {
      message: `操作过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后再试`,
      detail: { key, limit, windowMs, retryAfterMs },
    });
  }

  recent.push(now);
  buckets.set(key, recent);
}

/** 仅用于测试与诊断：清空某个 key 的计数 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
