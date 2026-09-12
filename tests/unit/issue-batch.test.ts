jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "@/lib/prisma";
import { createIssuesFromSubtasks } from "@/lib/issue-batch";

const mockedGetPrisma = jest.mocked(getPrisma);

/** 构造一个内存版事务客户端：记录 create 的入参，count/aggregate 由用例注入 */
function makeTx({ existingIds = [] as string[], maxPosition = null as number | null }) {
  const created: Array<{ id: string; position: number; workspaceId: string }> = [];
  const tx = {
    issue: {
      count: jest
        .fn()
        .mockImplementation(
          ({ where }) => existingIds.filter((id) => where.id.in.includes(id)).length
        ),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: maxPosition } }),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return data;
      }),
    },
  };
  const db = {
    $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
    issue: { count: tx.issue.count },
  };
  mockedGetPrisma.mockReturnValue(db as never);
  return { tx, created, db };
}

const subtasks = [{ title: "子任务一" }, { title: "子任务二", description: "有描述" }];

describe("AI 批量创建（lib/issue-batch）", () => {
  test("主键带上 workspaceId 前缀，跨 Workspace 的同 requestId 互不冲突", async () => {
    const { tx } = makeTx({});
    await createIssuesFromSubtasks({
      workspaceId: "ws_a",
      requestId: "req-abc12345",
      subtasks,
    });

    expect(tx.issue.create.mock.calls.map((call) => call[0].data.id)).toEqual([
      "ws_a:req-abc12345:0",
      "ws_a:req-abc12345:1",
    ]);
  });

  test("position 落在本列已有最大值之后，而不是从 0 开始撞号", async () => {
    const { created } = makeTx({ maxPosition: 300 });
    await createIssuesFromSubtasks({
      workspaceId: "ws_a",
      requestId: "req-abc12345",
      subtasks,
    });

    expect(created.map((row) => row.position)).toEqual([400, 500]);
  });

  test("空列时 position 从 0 开始", async () => {
    const { created } = makeTx({ maxPosition: null });
    await createIssuesFromSubtasks({
      workspaceId: "ws_a",
      requestId: "req-abc12345",
      subtasks,
    });

    expect(created.map((row) => row.position)).toEqual([0, 100]);
  });

  test("批次已完整存在时返回 duplicate，不产生新数据", async () => {
    const { created } = makeTx({ existingIds: ["ws_a:req-abc12345:0", "ws_a:req-abc12345:1"] });
    const result = await createIssuesFromSubtasks({
      workspaceId: "ws_a",
      requestId: "req-abc12345",
      subtasks,
    });

    expect(result).toEqual({ createdCount: 2, duplicate: true });
    expect(created).toHaveLength(0);
  });

  test("半批次存在（异常状态）时拒绝而不是静默混入", async () => {
    makeTx({ existingIds: ["ws_a:req-abc12345:0"] });
    await expect(
      createIssuesFromSubtasks({ workspaceId: "ws_a", requestId: "req-abc12345", subtasks })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("并发落败撞 P2002 且能读回完整批次时返回 duplicate", async () => {
    const db = {
      $transaction: jest.fn().mockImplementation(async () => {
        throw { code: "P2002" };
      }),
      issue: { count: jest.fn().mockResolvedValue(2) },
    };
    jest.mocked(getPrisma).mockReturnValue(db as never);

    const result = await createIssuesFromSubtasks({
      workspaceId: "ws_a",
      requestId: "req-abc12345",
      subtasks,
    });
    expect(result).toEqual({ createdCount: 2, duplicate: true });
  });
});
