import "server-only";

import { AppError } from "@/lib/errors";

/**
 * 单实例内存滑动窗口限流。
 *
 * 三个语义分开的函数，是为了支持「只对失败计数」这种策略：
 * - checkRateLimit()     只检查、不计数 —— 先看是否已超限，再决定要不要做昂贵操作；
 * - recordRateLimitHit() 只计数 —— 失败之后补记一笔（合法用户不会因自己的历史失败被挡住）；
 * - consumeRateLimit()   检查 + 计数 —— 每次调用都算数的场景（AI 调用、注册的 IP 桶）。
 *
 * 为什么用内存：MVP 单容器，无需引入 Redis。多副本时各副本独立计数、额度会被放大
 * （见 docs/03-development/p0-delivery-plan.md §9）。届时换 store 即可，函数签名不变。
 *
 * 为什么是滑动窗口：固定窗口在切换瞬间会放行约 2 倍流量，滑动窗口没有该尖峰。
 *
 * 内存边界（重要）：key 可能由**未认证**的调用方决定（例如登录时填的邮箱）。
 * 因此必须有容量上限与全量清理，否则攻击者用海量随机 key 就能把进程内存撑爆。
 */

type Bucket = {
  /** 命中时间戳（毫秒），升序 */
  hits: number[];
  /** 该 key 的窗口长度，用于全量清理时判定过期 */
  windowMs: number;
};

const buckets = new Map<string, Bucket>();

/** 最多同时跟踪的 key 数；超出时按插入顺序淘汰最旧的（FIFO，非严格 LRU） */
const MAX_TRACKED_KEYS = 5_000;

/** 全量清理的最小间隔，避免每次调用都遍历整个 Map */
const SWEEP_INTERVAL_MS = 60_000;

let lastSweepAt = 0;

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  /**
   * 日志用标签。**禁止包含 PII**（邮箱等）——超限会写入服务端日志，
   * 所以只记类型（如 `auth:login:email`），不记具体值。
   */
  label?: string;
};

function recentHits(key: string, now: number, windowMs: number): number[] {
  const bucket = buckets.get(key);
  if (!bucket) return [];
  const cutoff = now - windowMs;
  return bucket.hits.filter((at) => at > cutoff);
}

/**
 * 清理过期 key；超过容量上限时按插入顺序淘汰。
 * 由写入路径触发，但有最小间隔，避免高频写入时反复遍历。
 */
function sweep(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && buckets.size <= MAX_TRACKED_KEYS) return;
  lastSweepAt = now;

  for (const [key, bucket] of buckets) {
    const cutoff = now - bucket.windowMs;
    const newest = bucket.hits[bucket.hits.length - 1];
    if (newest === undefined || newest <= cutoff) {
      buckets.delete(key);
    }
  }

  if (buckets.size <= MAX_TRACKED_KEYS) return;

  // 仍然超限（说明正被海量随机 key 冲击）：按插入顺序淘汰，优先保住内存。
  // 代价是被淘汰 key 的计数归零，极端冲击下额度会短暂放宽——可接受。
  for (const key of buckets.keys()) {
    if (buckets.size <= MAX_TRACKED_KEYS) break;
    buckets.delete(key);
  }
}

function retryAfterSeconds(oldestHit: number, now: number, windowMs: number): number {
  return Math.ceil(Math.max(0, oldestHit + windowMs - now) / 1000);
}

/** 只检查：已超限则抛 RATE_LIMITED，不计数 */
export function checkRateLimit({ key, limit, windowMs, label }: RateLimitOptions): void {
  const now = Date.now();
  const recent = recentHits(key, now, windowMs);
  if (recent.length < limit) return;

  throw new AppError("RATE_LIMITED", {
    message: `操作过于频繁，请 ${retryAfterSeconds(recent[0], now, windowMs)} 秒后再试`,
    detail: { label: label ?? "rate-limit", limit, windowMs, hits: recent.length },
  });
}

/** 只计数：不检查是否超限（由下一次 check 负责拦截） */
export function recordRateLimitHit(key: string, windowMs: number): void {
  const now = Date.now();
  sweep(now);

  const recent = recentHits(key, now, windowMs);
  recent.push(now);
  buckets.set(key, { hits: recent, windowMs });
}

/** 检查 + 计数：每次调用都占额度 */
export function consumeRateLimit(options: RateLimitOptions): void {
  checkRateLimit(options);
  recordRateLimitHit(options.key, options.windowMs);
}

/** 清空某个 key 的计数（例如登录成功后重置该邮箱的失败次数） */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** 诊断用：当前跟踪的 key 数量（用于验证容量上限生效） */
export function trackedKeyCount(): number {
  return buckets.size;
}
