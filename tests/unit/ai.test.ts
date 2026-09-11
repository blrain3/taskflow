import { parseAndValidateSubtasks } from "@/lib/ai-parser";
import { isRetryableAiError } from "@/lib/ai-retry";

describe("AI output parsing", () => {
  test("extracts and normalizes a valid JSON array", () => {
    const output = JSON.stringify([
      { title: "实现登录", description: "补充测试" },
      { title: "补充校验", description: "" },
      { title: "验证流程", description: "回归测试" },
    ]);
    expect(parseAndValidateSubtasks(output)).toEqual([
      { title: "实现登录", description: "补充测试" },
      { title: "补充校验", description: null },
      { title: "验证流程", description: "回归测试" },
    ]);
  });

  test("rejects non-JSON output with AI_INVALID_OUTPUT", () => {
    try {
      parseAndValidateSubtasks("不是 JSON");
      throw new Error("expected parser to reject invalid output");
    } catch (error) {
      expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT" });
    }
  });
});

describe("AI retry classification", () => {
  test("retries upstream 5xx errors", () => {
    const error = Object.assign(new Error("upstream"), { status: 503 });
    expect(isRetryableAiError(error)).toBe(true);
  });

  test("does not retry authentication or request errors", () => {
    expect(isRetryableAiError(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe(
      false
    );
    expect(isRetryableAiError(Object.assign(new Error("bad request"), { status: 400 }))).toBe(
      false
    );
  });
});
