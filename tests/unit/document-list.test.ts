jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "@/lib/prisma";
import { listDocuments, listDocumentVersions } from "@/lib/documents";

describe("document listing", () => {
  test("list projection excludes the document body and keeps a hard cap", async () => {
    // 正文单条上限 20 万字符：列表页若把 content 一并取出，会同时放大数据库读、
    // 服务端内存与 RSC 负载。这条断言把「列表不带正文」固化成回归护栏。
    const findMany = jest.fn().mockResolvedValue([]);
    (getPrisma as jest.Mock).mockReturnValue({ document: { findMany } });

    await listDocuments("ws_1");

    const args = findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      take: number;
    };
    expect(args.where).toEqual({ workspaceId: "ws_1", deletedAt: null });
    expect(args.select).not.toHaveProperty("content");
    expect(args.take).toBeGreaterThan(0);
  });

  test("maps rows into ISO strings and rejects unknown enum values", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "doc_1",
        title: "标题",
        summary: null,
        status: "DRAFT",
        format: "MARKDOWN",
        contentVersion: 1,
        createdAt: new Date("2026-09-13T02:00:00.000Z"),
        updatedAt: new Date("2026-09-13T02:00:00.000Z"),
      },
    ]);
    (getPrisma as jest.Mock).mockReturnValue({ document: { findMany } });

    const [item] = await listDocuments("ws_1");

    expect(item.createdAt).toBe("2026-09-13T02:00:00.000Z");
    expect(item.updatedAt).toBe("2026-09-13T02:00:00.000Z");
    expect(item.status).toBe("DRAFT");
  });

  test("rejects a document row carrying an unknown status", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "doc_1",
        title: "标题",
        summary: null,
        status: "PUBLISHED",
        format: "MARKDOWN",
        contentVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    (getPrisma as jest.Mock).mockReturnValue({ document: { findMany } });

    await expect(listDocuments("ws_1")).rejects.toMatchObject({ code: "INTERNAL" });
  });

  test("version history is scoped by workspace and capped", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    (getPrisma as jest.Mock).mockReturnValue({ documentVersion: { findMany } });

    await listDocumentVersions("doc_1", "ws_1");

    const args = findMany.mock.calls[0][0] as {
      where: { documentId: string; document: Record<string, unknown> };
      take: number;
    };
    // 通过 relation 过滤工作区：仅凭 documentId 不足以读到他人文档的版本历史
    expect(args.where.documentId).toBe("doc_1");
    expect(args.where.document).toEqual({ workspaceId: "ws_1", deletedAt: null });
    expect(args.take).toBeGreaterThan(0);
  });
});
