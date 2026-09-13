jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "@/lib/prisma";
import { assertDocumentAccess } from "@/lib/document-permissions";

function prismaStub(options: {
  document: { id: string; workspaceId: string } | null;
  role?: string | null;
}) {
  return {
    document: { findFirst: jest.fn().mockResolvedValue(options.document) },
    workspaceMember: {
      findUnique: jest.fn().mockResolvedValue(options.role ? { role: options.role } : null),
    },
  };
}

describe("document permissions", () => {
  test("throws NOT_FOUND when the document does not exist", async () => {
    (getPrisma as jest.Mock).mockReturnValue(prismaStub({ document: null }));

    await expect(assertDocumentAccess("user_1", "doc_1", "read")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("throws FORBIDDEN for a non-member", async () => {
    (getPrisma as jest.Mock).mockReturnValue(
      prismaStub({ document: { id: "doc_1", workspaceId: "ws_1" }, role: null })
    );

    await expect(assertDocumentAccess("user_1", "doc_1", "read")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("returns the owning workspace so callers write to the same one they authorized against", async () => {
    (getPrisma as jest.Mock).mockReturnValue(
      prismaStub({ document: { id: "doc_1", workspaceId: "ws_1" }, role: "OWNER" })
    );

    await expect(assertDocumentAccess("user_1", "doc_1", "read")).resolves.toEqual({
      id: "doc_1",
      workspaceId: "ws_1",
    });
  });

  test("rejects edit for a read-only role", async () => {
    (getPrisma as jest.Mock).mockReturnValue(
      prismaStub({ document: { id: "doc_1", workspaceId: "ws_1" }, role: "VIEWER" })
    );

    await expect(assertDocumentAccess("user_1", "doc_1", "edit")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("allows edit for an editor", async () => {
    (getPrisma as jest.Mock).mockReturnValue(
      prismaStub({ document: { id: "doc_1", workspaceId: "ws_1" }, role: "EDITOR" })
    );

    await expect(assertDocumentAccess("user_1", "doc_1", "edit")).resolves.toMatchObject({
      workspaceId: "ws_1",
    });
  });
});
