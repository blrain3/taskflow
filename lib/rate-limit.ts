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

/**
 * 最多同时跟踪的 key 数；超出时按 **LRU（最久未命中先淘汰）** 淘汰。
 *
 * 这里必须用 LRU 而不是「按插入顺序淘汰」，原因是 Map 的语义：
 * `Map.set()` 对**已存在**的 key 不会改变它在遍历顺序中的位置，
 * 因此「最早插入」的恰恰是长期活跃的合法 key（例如某台常用设备的登录桶），
 * 按插入顺序淘汰会优先把这类 key 挤掉，淘汰顺序与保护目标正好相反。
 * `recordRateLimitHit` 每次写入前先 `delete` 再 `set`，使遍历顺序等于「最近命中顺序」，
 * 淘汰队首即淘汰最久未命中者。
 */
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
 * 过期清理 + 容量淘汰。**只在写入前调用**（见 recordRateLimitHit），因此这里必须
 * 为「即将写入的那个 key」腾出空位，否则上限会被顶到 MAX + 1。
 *
 * 两件事分开处理：
 * 1) 过期清理按时间间隔摊销（全量遍历 Map，不限制频率会很贵）；
 * 2) 容量淘汰每次写入都做，但每次最多淘汰一个（队首即最久未命中者），因此是 O(1)。
 *    这一点很重要：它把「容量满时的高频写入」从「每次全量扫描」降为摊销成本。
 */
function sweep(now: number): void {
  if (now - lastSweepAt >= SWEEP_INTERVAL_MS) {
    lastSweepAt = now;

    for (const [key, bucket] of buckets) {
      const cutoff = now - bucket.windowMs;
      const newest = bucket.hits[bucket.hits.length - 1];
      if (newest === undefined || newest <= cutoff) {
        buckets.delete(key);
      }
    }
  }

  // 淘汰队首直到有空位。队首是「最久未命中」的 key（写入时会刷新位置），
  // 因此长期活跃的合法 key 不会被海量随机 key 挤掉。
  // 代价是被淘汰 key 的计数归零，极端冲击下额度会短暂放宽——可接受。
  while (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
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

/** 只检查、不抛错：超限返回 true。供无法用异常表达语义的调用方使用（如 authorize 静默拒绝） */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  return recentHits(key, now, windowMs).length >= limit;
}

/** 只计数：不检查是否超限（由下一次 check 负责拦截） */
export function recordRateLimitHit(key: string, windowMs: number): void {
  const now = Date.now();
  sweep(now);

  const recent = recentHits(key, now, windowMs);
  recent.push(now);

  // 先删再插，把该 key 移到遍历顺序末尾——这一步是 LRU 的关键。
  // 若直接 set 一个已存在的 key，它在 Map 中的位置不变，淘汰顺序就会退化成「按首次插入」。
  buckets.delete(key);
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

/**
 * 诊断用：按「即将被淘汰的先后」列出当前跟踪的 key。
 *
 * 存在的意义是让 LRU 这条不变量**可被测试钉住**——它不会体现在任何返回值上，
 * 一旦有人把 `recordRateLimitHit` 的「先删再插」改回直接 set，
 * 淘汰顺序会静默退化成按首次插入，只有这个访问器能暴露该回归。
 */
export function trackedKeys(): string[] {
  return [...buckets.keys()];
}

/** 诊断用：清空全部计数。仅用于测试隔离，业务代码不得调用。 */
export function resetAllRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}
