import "server-only";

import { AppError } from "@/lib/errors";
import { aiOutputSubtasksSchema, generatedSubtaskSchema } from "@/lib/validation";
import type { GeneratedSubtask } from "@/types/issue";

/**
 * 抽出文本里所有「括号平衡的 JSON 数组片段」，按出现位置升序返回。
 *
 * 为什么不用 `text.match(/\[[\s\S]*\]/)`：贪婪匹配会从**第一个** `[` 一路吃到**最后一个** `]`。
 * 只要模型在数组之外还输出了方括号（典型的如「先看 [背景] 再输出 [...]」），
 * 拼出来的字符串就不是合法 JSON，一次本可恢复的响应会被直接判成不可用。
 *
 * 这里做真正的配对扫描，并正确处理两件贪婪正则做不到的事：
 * 字符串内的方括号（`{"title":"[紧急]"}`）与转义引号（`\"`）不参与计数。
 */
function balancedArrayCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "[") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

type ParseOutcome = { ok: true; subtasks: GeneratedSubtask[] } | { ok: false; detail: string };

/** 尝试把单个候选片段解析为合规的子任务数组；任一步不合规即视为该候选不可用 */
function tryParseCandidate(candidate: string): ParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false, detail: "JSON 解析失败" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, detail: "AI 输出顶层不是数组" };
  }

  const subtasks: GeneratedSubtask[] = [];
  for (const item of parsed) {
    const result = generatedSubtaskSchema.safeParse(item);
    if (!result.success) {
      return { ok: false, detail: result.error.message };
    }
    subtasks.push({
      title: result.data.title,
      description: result.data.description ?? null,
    });
  }

  const counted = aiOutputSubtasksSchema.safeParse(subtasks);
  if (!counted.success) {
    return { ok: false, detail: counted.error.issues[0]?.message ?? "条数不合规" };
  }

  return { ok: true, subtasks };
}

/**
 * 从模型输出文本中提取并校验结构化子任务。
 *
 * 容忍度策略：模型偶尔会在数组前后写说明文字或夹带方括号，这类响应本身仍然可用，
 * 因此逐个尝试所有平衡数组片段，取第一个能通过 Schema 与条数校验的。
 * 但**不容忍**任何不合规的数据：全部候选都不通过时抛 AI_INVALID_OUTPUT，
 * 上游据此零写入（架构评审 P2-11）。
 */
export function parseAndValidateSubtasks(text: string): GeneratedSubtask[] {
  const candidates = balancedArrayCandidates(text);
  if (candidates.length === 0) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 输出不含 JSON 数组" });
  }

  let firstDetail = "";
  for (const candidate of candidates) {
    const outcome = tryParseCandidate(candidate);
    if (outcome.ok) return outcome.subtasks;
    if (!firstDetail) firstDetail = outcome.detail;
  }

  // 报第一个候选的失败原因：它才是模型真正想输出的那个数组，定位问题最有用
  throw new AppError("AI_INVALID_OUTPUT", { detail: firstDetail });
}
