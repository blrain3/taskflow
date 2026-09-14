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

/**
 * 抽取的容错能力（架构评审 P2-11）。
 *
 * 原实现用贪婪正则 `/\[[\s\S]*\]/`：它会从第一个 `[` 吃到最后一个 `]`，
 * 于是「数组之外还有方括号」这种很常见的模型输出会被拼成非法 JSON，
 * 一次本可恢复的响应被误判为不可用。这几条用例就是为该缺陷设的回归网。
 */
describe("AI output extraction tolerance", () => {
  const threeTasks = [
    { title: "任务一", description: null },
    { title: "任务二", description: null },
    { title: "任务三", description: null },
  ];

  test("数组之前有说明文字时仍能抽出", () => {
    const output = `好的，我把它拆成下面这些：\n${JSON.stringify(threeTasks)}`;
    expect(parseAndValidateSubtasks(output)).toHaveLength(3);
  });

  test("数组之外还出现方括号时不再被贪婪匹配破坏（原实现会失败）", () => {
    // 贪婪正则会把 "[背景]" 与后面的数组一起吞掉，拼出 "…[背景]…[...]" → 非法 JSON
    const output = `先看 [背景] 再输出：${JSON.stringify(threeTasks)}`;

    expect(parseAndValidateSubtasks(output)).toEqual(threeTasks);
  });

  test("标题里含方括号时不影响配对", () => {
    const withBrackets = [
      { title: "[紧急] 修复登录", description: null },
      { title: "任务二", description: null },
      { title: "任务三", description: null },
    ];
    const output = `结果：${JSON.stringify(withBrackets)}`;

    expect(parseAndValidateSubtasks(output)[0].title).toBe("[紧急] 修复登录");
  });

  test("markdown 代码块包裹时仍能抽出", () => {
    const output = "```json\n" + JSON.stringify(threeTasks) + "\n```";
    expect(parseAndValidateSubtasks(output)).toHaveLength(3);
  });

  test("全部候选都不合规时抛 AI_INVALID_OUTPUT（不容忍脏数据）", () => {
    // 一个全是数字的平衡数组 + 一个缺 title 的数组，都不应被接受
    expect(() => parseAndValidateSubtasks('先 [1,2] 再 [{"foo":"bar"}]')).toThrow(
      expect.objectContaining({ code: "AI_INVALID_OUTPUT" })
    );
  });

  test("条数不足仍然被拒（容错不等于放宽契约）", () => {
    const twoTasks = JSON.stringify([
      { title: "只有一条", description: null },
      { title: "只有两条", description: null },
    ]);

    expect(() => parseAndValidateSubtasks(`前言 [备注] 正文 ${twoTasks}`)).toThrow(
      expect.objectContaining({ code: "AI_INVALID_OUTPUT" })
    );
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
