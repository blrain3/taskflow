jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "@/lib/prisma";
import { deleteDocument, restoreDocumentVersion, saveDocument } from "@/lib/documents";

function transactionDb(tx: Record<string, unknown>) {
  return { $transaction: jest.fn(async (callback: (value: unknown) => unknown) => callback(tx)) };
}

/**
 * 一份满足领域映射要求的完整文档行。
 * 领域层会把数据库行映射成 DocumentItem（与 Issue 模块的 toIssueItem 同一做法），
 * 其中包含 status / format 的枚举合法性校验，因此 fixture 必须给全字段。
 */
function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_1",
    title: "标题",
    summary: null,
    status: "DRAFT",
    format: "MARKDOWN",
    contentVersion: 1,
    content: "正文",
    createdAt: new Date("2026-09-13T02:00:00.000Z"),
    updatedAt: new Date("2026-09-13T02:00:00.000Z"),
    ...overrides,
  };
}

describe("document persistence", () => {
  test("rejects a stale save without creating a new version", async () => {
    const tx = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      documentVersion: { create: jest.fn() },
    };
    (getPrisma as jest.Mock).mockReturnValue(transactionDb(tx));

    await expect(
      saveDocument({
        id: "doc_1",
        workspaceId: "ws_1",
        userId: "user_1",
        title: "新标题",
        content: "正文",
        summary: null,
        format: "MARKDOWN",
        baseVersion: 2,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(tx.documentVersion.create).not.toHaveBeenCalled();
  });

  test("scopes the conditional update to the document's own workspace", async () => {
    // 授权判定与写入范围必须同源：Action 传进来的 workspaceId 要真的出现在 where 里，
    // 否则「按 A 授权、往 B 写」在多工作区场景下会变成越权。
    const tx = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(documentRow({ contentVersion: 3 })),
      },
      documentVersion: { create: jest.fn().mockResolvedValue({ id: "v3" }) },
    };
    (getPrisma as jest.Mock).mockReturnValue(transactionDb(tx));

    await saveDocument({
      id: "doc_1",
      workspaceId: "ws_from_document",
      userId: "user_1",
      title: "标题",
      content: "正文",
      summary: null,
      format: "MARKDOWN",
      baseVersion: 2,
    });

    expect(tx.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "doc_1",
          workspaceId: "ws_from_document",
          contentVersion: 2,
          deletedAt: null,
        }),
      })
    );
  });

  test("leaves the summary untouched when the form does not submit it", async () => {
    const tx = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(documentRow({ contentVersion: 3 })),
      },
      documentVersion: { create: jest.fn().mockResolvedValue({ id: "v3" }) },
    };
    (getPrisma as jest.Mock).mockReturnValue(transactionDb(tx));

    await saveDocument({
      id: "doc_1",
      workspaceId: "ws_1",
      userId: "user_1",
      title: "标题",
      content: "正文",
      format: "MARKDOWN",
      baseVersion: 2,
    });

    const updateArgs = tx.document.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data).not.toHaveProperty("summary");
  });

  test("restoring a version creates a new current version", async () => {
    const current = { id: "doc_1", workspaceId: "ws_1", contentVersion: 3 };
    const source = {
      version: 1,
      title: "旧标题",
      content: "旧正文",
      summary: null,
      format: "MARKDOWN",
    };
    const tx = {
      document: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(
          documentRow({
            id: "doc_1",
            title: "旧标题",
            content: "旧正文",
            contentVersion: 4,
          })
        ),
      },
      documentVersion: {
        findUnique: jest.fn().mockResolvedValue(source),
        create: jest.fn().mockResolvedValue({ id: "v4" }),
      },
    };
    (getPrisma as jest.Mock).mockReturnValue(transactionDb(tx));

    const result = await restoreDocumentVersion({
      documentId: "doc_1",
      workspaceId: "ws_1",
      userId: "user_1",
      version: 1,
      baseVersion: 3,
    });

    expect(result.contentVersion).toBe(4);
    expect(tx.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4, content: "旧正文" }),
      })
    );
  });

  test("soft delete archives the document instead of removing the row", async () => {
    // 列表之所以能「删除后立刻消失」，依据是 deletedAt 被置位 + 列表查询过滤 deletedAt: null；
    // 行与版本历史必须保留，否则历史版本恢复会失去依据。
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    (getPrisma as jest.Mock).mockReturnValue({ document: { updateMany } });

    await deleteDocument({ id: "doc_1", workspaceId: "ws_1" });

    const args = updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(args.where).toEqual({ id: "doc_1", workspaceId: "ws_1", deletedAt: null });
    expect(args.data.status).toBe("ARCHIVED");
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  test("soft delete reports NOT_FOUND when nothing matched", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    (getPrisma as jest.Mock).mockReturnValue({ document: { updateMany } });

    await expect(deleteDocument({ id: "doc_1", workspaceId: "ws_1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
