jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "@/lib/prisma";
import { createIssue, ISSUE_POSITION_STEP } from "@/lib/issues";

const mockedGetPrisma = jest.mocked(getPrisma);

/** 构造满足 toIssueItem 的行数据 */
function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "iss_1",
    title: "手动创建的任务",
    description: null,
    status: "BACKLOG",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("手动创建任务的 position 分配", () => {
  test("position 接在 BACKLOG 列已有最大值之后（与 AI 批量创建同一规则）", async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => makeRow(data));
    mockedGetPrisma.mockReturnValue({
      issue: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 300 } }),
        create,
      },
    } as never);

    await createIssue({ workspaceId: "ws_a", title: "手动创建的任务" });

    expect(create.mock.calls[0][0].data.position).toBe(300 + ISSUE_POSITION_STEP);
  });

  test("空列时 position 从 0 开始", async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => makeRow(data));
    mockedGetPrisma.mockReturnValue({
      issue: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
        create,
      },
    } as never);

    await createIssue({ workspaceId: "ws_a", title: "手动创建的任务" });

    expect(create.mock.calls[0][0].data.position).toBe(0);
  });
});
