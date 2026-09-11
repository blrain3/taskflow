import { aiBreakdownRequestSchema, aiOutputSubtasksSchema } from "@/lib/validation";

describe("AI validation contracts", () => {
  test("accepts prompt at the 10 and 4000 character boundaries", () => {
    expect(aiBreakdownRequestSchema.safeParse({ prompt: "a".repeat(10) }).success).toBe(true);
    expect(aiBreakdownRequestSchema.safeParse({ prompt: "a".repeat(4000) }).success).toBe(true);
  });

  test("requires between 3 and 10 generated subtasks", () => {
    const item = { title: "执行任务", description: null };
    expect(aiOutputSubtasksSchema.safeParse([item, item]).success).toBe(false);
    expect(aiOutputSubtasksSchema.safeParse([item, item, item]).success).toBe(true);
    expect(aiOutputSubtasksSchema.safeParse(Array.from({ length: 11 }, () => item)).success).toBe(
      false
    );
  });
});
