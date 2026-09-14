import { AppError } from "@/lib/errors";
import {
  consumeRateLimit,
  recordRateLimitHit,
  resetAllRateLimits,
  resetRateLimit,
  trackedKeyCount,
  trackedKeys,
} from "@/lib/rate-limit";

const WINDOW_MS = 60_000;

describe("in-memory rate limit", () => {
  afterEach(() => resetRateLimit("test:key"));

  test("rejects the request after the configured number of calls", () => {
    consumeRateLimit({ key: "test:key", limit: 2, windowMs: WINDOW_MS });
    consumeRateLimit({ key: "test:key", limit: 2, windowMs: WINDOW_MS });

    expect(() => consumeRateLimit({ key: "test:key", limit: 2, windowMs: WINDOW_MS })).toThrow(
      AppError
    );
  });
});

/**
 * 淘汰顺序（架构评审 P2-5）。
 *
 * 这条不变量不会体现在任何返回值上：淘汰顺序错了，限流依旧工作，只是**额度保护的对象错了**。
 * 所以只能靠 `trackedKeys()` 直接观察内部顺序来钉住它。
 */
describe("限流表淘汰顺序为 LRU", () => {
  beforeEach(() => resetAllRateLimits());
  afterEach(() => resetAllRateLimits());

  test("命中已有 key 会把它移到淘汰顺序末尾", () => {
    recordRateLimitHit("a", WINDOW_MS);
    recordRateLimitHit("b", WINDOW_MS);
    expect(trackedKeys()).toEqual(["a", "b"]);

    // 再次命中 a：Map 对已存在 key 的 set 不改变位置，必须靠「先删再插」才能把它移到末尾
    recordRateLimitHit("a", WINDOW_MS);
    expect(trackedKeys()).toEqual(["b", "a"]);
  });

  test("容量超限时淘汰最久未命中的 key，长期活跃的 key 不被随机 key 挤掉", () => {
    // 先插入一个「长期活跃」的 key，随后被大量随机 key 淹没
    recordRateLimitHit("hot", WINDOW_MS);

    // 填满容量
    const floodSize = trackedKeyCount();
    for (let i = 0; i < 4_999; i += 1) {
      recordRateLimitHit(`flood-${i}`, WINDOW_MS);
    }
    expect(trackedKeyCount()).toBe(floodSize + 4_999); // 5_000，恰在上限内

    // hot 是「最早插入但仍在被命中」的 key——这正是 LRU 与按插入顺序淘汰的分歧点
    recordRateLimitHit("hot", WINDOW_MS);

    // 再灌入若干 key 触发淘汰
    for (let i = 0; i < 50; i += 1) {
      recordRateLimitHit(`extra-${i}`, WINDOW_MS);
    }

    expect(trackedKeyCount()).toBe(5_000); // 容量始终有界
    expect(trackedKeys()).toContain("hot"); // 活跃 key 存活
    expect(trackedKeys()).not.toContain("flood-0"); // 最久未命中的被淘汰
  });

  test("容量上限内不做任何淘汰", () => {
    for (let i = 0; i < 10; i += 1) {
      recordRateLimitHit(`k-${i}`, WINDOW_MS);
    }

    expect(trackedKeyCount()).toBe(10);
    expect(trackedKeys()).toHaveLength(10);
  });
});
