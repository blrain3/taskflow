import {
  createDocumentSchema,
  DOCUMENT_CONTENT_MAX_LENGTH,
  saveDocumentSchema,
} from "@/lib/validation";

describe("document validation", () => {
  test("accepts a markdown document", () => {
    const result = createDocumentSchema.safeParse({
      title: "设计说明",
      content: "# 目标",
      format: "MARKDOWN",
    });

    expect(result.success).toBe(true);
  });

  test("rejects an empty title", () => {
    expect(createDocumentSchema.safeParse({ title: "", content: "正文" }).success).toBe(false);
  });

  test("rejects content beyond the length limit", () => {
    expect(
      createDocumentSchema.safeParse({
        title: "标题",
        content: "x".repeat(DOCUMENT_CONTENT_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
  });

  test("distinguishes an absent summary from an empty one", () => {
    // 关键区别：未提交 = undefined（保存时保持原值），提交空白串 = null（显式清空）。
    // saveDocument 依赖这个区别，否则编辑器保存一次就会把摘要静默清空。
    const absent = createDocumentSchema.safeParse({ title: "标题" });
    expect(absent.success && absent.data.summary).toBeUndefined();

    const emptied = createDocumentSchema.safeParse({ title: "标题", summary: "  " });
    expect(emptied.success && emptied.data.summary).toBeNull();
  });

  test("rejects an unknown format", () => {
    expect(createDocumentSchema.safeParse({ title: "标题", format: "HTML" }).success).toBe(false);
  });

  test("requires a positive base version when saving", () => {
    expect(
      saveDocumentSchema.safeParse({
        id: "doc_1",
        title: "标题",
        content: "正文",
        format: "MARKDOWN",
        baseVersion: 0,
      }).success
    ).toBe(false);
  });
});
