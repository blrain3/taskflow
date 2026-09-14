import { AppError, toActionError } from "@/lib/errors";
import { logError, logInfo, logWarn, setLogSink } from "@/lib/logger";

/**
 * 统一日志出口单测（架构评审 P2-4）。
 *
 * 这个测试真正的价值不在 logger 本身（它只是转发），而在于**证明 `toActionError`
 * 已经不再直接调用 console**：只要通过替换 sink 就能观察到它写出的日志，
 * 说明日志出口确实被收敛到了一处，将来换结构化 JSON 时只需改这一个地方。
 */
type Recorded = { level: string; message: string; detail?: unknown };

let recorded: Recorded[] = [];

beforeEach(() => {
  recorded = [];
  setLogSink((level, message, detail) => {
    recorded.push({ level, message, detail });
  });
});

afterEach(() => {
  setLogSink(null); // 恢复默认 console 实现，避免污染其它测试
});

describe("日志出口可替换", () => {
  test("三个级别都经同一个 sink 写出", () => {
    logError("出错了", { a: 1 });
    logWarn("注意");
    logInfo("信息", "详情");

    expect(recorded).toEqual([
      { level: "error", message: "出错了", detail: { a: 1 } },
      { level: "warn", message: "注意", detail: undefined },
      { level: "info", message: "信息", detail: "详情" },
    ]);
  });

  test("传 null 恢复默认 console 实现", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    setLogSink(null);

    logError("走默认出口");

    expect(spy).toHaveBeenCalledWith("走默认出口");
    spy.mockRestore();
  });
});

describe("错误收敛经统一出口写日志", () => {
  test("INTERNAL 级别或带 detail 的 AppError 会被记录", () => {
    toActionError(new AppError("INTERNAL", { detail: "数据库连接断开" }));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].level).toBe("error");
    expect(recorded[0].message).toContain("INTERNAL");
    expect(recorded[0].detail).toBe("数据库连接断开");
  });

  test("普通业务错误不产生日志噪音（只有安全文案下发给客户端）", () => {
    const result = toActionError(new AppError("NOT_FOUND"));

    expect(recorded).toHaveLength(0);
    expect(result).toEqual({ code: "NOT_FOUND", message: "目标不存在或已被删除" });
  });

  test("未知异常记录结构化摘要而不是原始堆栈", () => {
    toActionError(new Error("database password=secret"));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].message).toContain("未预期异常");
    expect(recorded[0].detail).toEqual({
      name: "Error",
      message: "database password=secret",
    });
  });
});
