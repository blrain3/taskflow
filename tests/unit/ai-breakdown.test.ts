import { breakdownSubtasks } from "@/lib/ai";
import { disabledFeatures, env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * AI 拆分流程单测（架构评审 P1-6）。
 *
 * 用 `AI_PROVIDER=mock` 驱动，完全不触碰外部模型；但走的仍是 `breakdownSubtasks` 的真实链路
 * （参数校验 → 限流 → AbortController 超时 → 输出 Schema 校验 → 错误归类），
 * 因此能把「哪一步在什么条件下抛哪个错误码」钉死。
 *
 * 最值得保护的一条是**顺序**：限流发生在参数校验之后。
 * 若顺序反过来，任何无效请求都会吃掉用户额度——这不是返回值能体现的回归。
 */
jest.mock("@/lib/env", () => ({
  env: {
    AI_PROVIDER: "mock",
    AI_TIMEOUT_MS: 30,
    AI_RATE_LIMIT_PER_MINUTE: 10,
  },
  disabledFeatures: jest.fn(() => []),
}));

jest.mock("@/lib/rate-limit", () => ({ consumeRateLimit: jest.fn() }));

/**
 * `@ai-sdk/openai` 与 `ai` 都是**纯 ESM** 包，ts-jest 以 CJS 运行时会直接报
 * 「Must use import to load ES Module」。这里必须把这两个包 mock 掉，
 * 否则连 `lib/ai.ts` 都无法加载（现有 ai-route.test.ts 是整体 mock `@/lib/ai` 才绕开这一点）。
 * mock 之后 mock provider 分支不依赖它们，openai 分支由 AI_DISABLED 在调用前拦下。
 */
jest.mock("@ai-sdk/openai", () => ({ createOpenAI: jest.fn() }));
jest.mock("ai", () => ({ generateText: jest.fn() }));

const mockedConsumeRateLimit = jest.mocked(consumeRateLimit);
const mockedDisabledFeatures = jest.mocked(disabledFeatures);
const mutableEnv = env as unknown as {
  AI_PROVIDER: string;
  AI_TIMEOUT_MS: number;
  AI_RATE_LIMIT_PER_MINUTE: number;
};

const VALID_PROMPT = "把登录功能拆成若干可执行任务";
const USER_ID = "user_1";

beforeEach(() => {
  mutableEnv.AI_PROVIDER = "mock";
  mutableEnv.AI_TIMEOUT_MS = 30;
  mutableEnv.AI_RATE_LIMIT_PER_MINUTE = 10;
  mockedDisabledFeatures.mockReturnValue([]);
});

describe("breakdownSubtasks 参数校验", () => {
  test("过短描述被拒，且不消耗限流额度", async () => {
    await expect(breakdownSubtasks("太短", USER_ID)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    // 顺序保证：无效请求不该占用用户额度（若先限流，用户会因别人乱试而受限）
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
  });

  test("有效请求按 userId 分桶限流", async () => {
    await breakdownSubtasks(VALID_PROMPT, USER_ID);

    expect(mockedConsumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: `ai:breakdown:${USER_ID}`, limit: 10 })
    );
  });
});

describe("breakdownSubtasks 能力开关", () => {
  test("openai 模式缺少必需变量时抛 AI_DISABLED，且不消耗额度", async () => {
    mutableEnv.AI_PROVIDER = "openai";
    mockedDisabledFeatures.mockReturnValue([{ feature: "ai", missing: ["AI_API_KEY"] }]);

    await expect(breakdownSubtasks(VALID_PROMPT, USER_ID)).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
  });
});

describe("breakdownSubtasks 输出处理", () => {
  test("mock 模式返回结构化子任务与 Token 统计（标记为估算）", async () => {
    const result = await breakdownSubtasks(VALID_PROMPT, USER_ID);

    expect(result.provider).toBe("mock");
    expect(result.attempts).toBe(1);
    expect(result.subtasks.length).toBeGreaterThanOrEqual(3);
    expect(result.subtasks[0]).toEqual(expect.objectContaining({ title: expect.any(String) }));
    expect(result.usage).toEqual(
      expect.objectContaining({ estimated: true, totalTokens: expect.any(Number) })
    );
  });

  test("输出不是合法 JSON → AI_INVALID_OUTPUT（零写入的前提）", async () => {
    await expect(breakdownSubtasks("请故意返回 INVALID 内容", USER_ID)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
  });

  test("条数不足 3 条 → AI_INVALID_OUTPUT（条数也是对外契约）", async () => {
    await expect(breakdownSubtasks("请故意返回 TOOFEW 条内容", USER_ID)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
  });

  test("上游超时按 AbortController 归类为 AI_TIMEOUT，不误报为解析失败", async () => {
    await expect(
      breakdownSubtasks("请触发 TIMEOUT 分支以走通中断链路", USER_ID)
    ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });
});
