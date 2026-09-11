import "server-only";

import { AppError } from "@/lib/errors";
import { aiOutputSubtasksSchema, generatedSubtaskSchema } from "@/lib/validation";
import type { GeneratedSubtask } from "@/types/issue";

/** 从模型输出文本中提取并校验结构化子任务。 */
export function parseAndValidateSubtasks(text: string): GeneratedSubtask[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 输出不含 JSON 数组" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "JSON 解析失败", cause: error });
  }

  if (!Array.isArray(parsed)) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: "AI 输出顶层不是数组" });
  }

  const subtasks: GeneratedSubtask[] = [];
  for (const item of parsed) {
    const result = generatedSubtaskSchema.safeParse(item);
    if (!result.success) {
      throw new AppError("AI_INVALID_OUTPUT", { detail: result.error.message });
    }
    subtasks.push({
      title: result.data.title,
      description: result.data.description ?? null,
    });
  }

  const counted = aiOutputSubtasksSchema.safeParse(subtasks);
  if (!counted.success) {
    throw new AppError("AI_INVALID_OUTPUT", { detail: counted.error.issues[0]?.message });
  }

  return subtasks;
}
