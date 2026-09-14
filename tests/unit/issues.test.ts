import { AppError } from "@/lib/errors";
import {
  createIssue,
  deleteIssue,
  ISSUE_POSITION_STEP,
  listIssues,
  moveIssueWithinWorkspace,
  toIssueItem,
  updateIssue,
} from "@/lib/issues";
import { getPrisma } from "@/lib/prisma";

/**
 * Issue 领域层单测（架构评审 P1-6）。
 *
 * 这是全项目「写错代价最高」的一段代码：数据隔离（workspaceId 过滤）与看板整列重写都在这里。
 * 之前它零测试覆盖，只能靠 HTTP 冒烟兜底，而冒烟跑不动时（容器未起）就完全没有回归网。
 *
 * 全部依赖 mock，不连数据库；断言重点是**查询形状**而不是返回值——
 * 少一个 workspaceId 条件不会让任何返回值出错，只会静默地把别人的数据暴露出去。
 */
jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));

const mockedGetPrisma = jest.mocked(getPrisma);

const WORKSPACE_ID = "ws_1";

type MockClient = {
  issue: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    aggregate: jest.Mock;
    count: jest.Mock;
  };
  $transaction: jest.Mock;
};

function mockClient(): MockClient {
  return {
    issue: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

/** 把伪造客户端装到 getPrisma() 上，并原样返回便于继续配置 */
function install(client: MockClient) {
  mockedGetPrisma.mockReturnValue(client as unknown as ReturnType<typeof getPrisma>);
  return client;
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "iss_1",
    title: "标题",
    description: null,
    status: "BACKLOG",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockedGetPrisma.mockReset();
});

describe("toIssueItem", () => {
  test("把 Date 转成 ISO 字符串，避免两端对时区做隐式假设", () => {
    expect(toIssueItem(row() as never)).toEqual({
      id: "iss_1",
      title: "标题",
      description: null,
      status: "BACKLOG",
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
  });

  test("数据库出现非法状态时抛 INTERNAL，而不是把它透给 UI", () => {
    expect(() => toIssueItem(row({ status: "ARCHIVED" }) as never)).toThrow(AppError);
  });
});

describe("listIssues", () => {
  test("列表模式按 createdAt 倒序，且查询带 workspaceId 与硬上限", async () => {
    const db = install(mockClient());
    db.issue.findMany.mockResolvedValue([row()]);

    await listIssues(WORKSPACE_ID, "list");

    expect(db.issue.findMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: expect.any(Object),
      take: 500,
    });
  });

  test("看板模式按 status → position 排序（列内序），与索引对齐", async () => {
    const db = install(mockClient());
    db.issue.findMany.mockResolvedValue([]);

    await listIssues(WORKSPACE_ID, "board");

    expect(db.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      })
    );
  });

  test("默认走列表模式", async () => {
    const db = install(mockClient());
    db.issue.findMany.mockResolvedValue([]);

    await listIssues(WORKSPACE_ID);

    expect(db.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    );
  });
});

describe("createIssue", () => {
  test("新任务追加到 BACKLOG 列尾：position 接在本列最大值之后", async () => {
    const db = install(mockClient());
    db.issue.aggregate.mockResolvedValue({ _max: { position: 300 } });
    db.issue.create.mockResolvedValue(row({ status: "BACKLOG" }));

    await createIssue({ workspaceId: WORKSPACE_ID, title: "新任务" });

    expect(db.issue.aggregate).toHaveBeenCalledWith({
      _max: { position: true },
      where: { workspaceId: WORKSPACE_ID, status: "BACKLOG" },
    });
    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          status: "BACKLOG",
          position: 300 + ISSUE_POSITION_STEP,
        }),
      })
    );
  });

  test("空列时 position 从 0 起（而不是依赖默认值造成永久并列）", async () => {
    const db = install(mockClient());
    db.issue.aggregate.mockResolvedValue({ _max: { position: null } });
    db.issue.create.mockResolvedValue(row());

    await createIssue({ workspaceId: WORKSPACE_ID, title: "第一张" });

    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 0 }) })
    );
  });

  test("未传描述时落 null，避免库里出现语义重复的两种「空」", async () => {
    const db = install(mockClient());
    db.issue.aggregate.mockResolvedValue({ _max: { position: null } });
    db.issue.create.mockResolvedValue(row());

    await createIssue({ workspaceId: WORKSPACE_ID, title: "无描述" });

    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: null }) })
    );
  });
});

describe("updateIssue / deleteIssue", () => {
  test("更新用 id + workspaceId 双条件，命中 0 行即 NOT_FOUND", async () => {
    const db = install(mockClient());
    db.issue.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateIssue({
        workspaceId: WORKSPACE_ID,
        id: "iss_other",
        title: "改",
        status: "DONE",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // 数据隔离断言：where 里必须有 workspaceId，否则就是跨工作区写入
    expect(db.issue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "iss_other", workspaceId: WORKSPACE_ID },
      })
    );
  });

  test("命中 1 行时正常返回", async () => {
    const db = install(mockClient());
    db.issue.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      updateIssue({ workspaceId: WORKSPACE_ID, id: "iss_1", title: "改", status: "DONE" })
    ).resolves.toBeUndefined();
  });

  test("删除同样以 id + workspaceId 为条件", async () => {
    const db = install(mockClient());
    db.issue.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteIssue({ workspaceId: WORKSPACE_ID, id: "iss_other" })).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    );

    expect(db.issue.deleteMany).toHaveBeenCalledWith({
      where: { id: "iss_other", workspaceId: WORKSPACE_ID },
    });
  });
});

describe("moveIssueWithinWorkspace", () => {
  function withTransaction(tx: Record<string, unknown>) {
    const db = install(mockClient());
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback(tx)
    );
    return db;
  }

  function txMock(overrides: Record<string, unknown> = {}) {
    return {
      issue: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
      ...overrides,
    };
  }

  test("清单缺少被移动任务时直接拒绝，且不开事务", async () => {
    const db = install(mockClient());

    await expect(
      moveIssueWithinWorkspace({
        workspaceId: WORKSPACE_ID,
        issueId: "iss_a",
        toStatus: "TODO",
        orderedIds: ["iss_b"],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test("清单里任一卡不属于当前工作区 → 整体 NOT_FOUND，不执行写入", async () => {
    const tx = txMock();
    tx.issue.count.mockResolvedValue(1); // 期望 2，实际 1
    withTransaction(tx);

    await expect(
      moveIssueWithinWorkspace({
        workspaceId: WORKSPACE_ID,
        issueId: "iss_a",
        toStatus: "TODO",
        orderedIds: ["iss_a", "iss_other"],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  test("写入行数少于预期（并发删除）→ NOT_FOUND，不静默成功", async () => {
    const tx = txMock();
    tx.issue.count.mockResolvedValue(1);
    tx.issue.findMany.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(0); // 期望 1 行
    withTransaction(tx);

    await expect(
      moveIssueWithinWorkspace({
        workspaceId: WORKSPACE_ID,
        issueId: "iss_a",
        toStatus: "TODO",
        orderedIds: ["iss_a"],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("清单内不属于目标列的卡片不参与重排；并发新增的卡追加到列尾", async () => {
    const tx = txMock();
    tx.issue.count.mockResolvedValue(2); // iss_a（被拖）+ iss_b（它列的卡）
    // 目标列当前有 iss_c、iss_d
    tx.issue.findMany.mockResolvedValue([{ id: "iss_c" }, { id: "iss_d" }]);
    tx.$executeRaw.mockResolvedValue(3); // fullOrder = iss_a, iss_c, iss_d
    withTransaction(tx);

    await moveIssueWithinWorkspace({
      workspaceId: WORKSPACE_ID,
      issueId: "iss_a",
      toStatus: "IN_PROGRESS",
      orderedIds: ["iss_a", "iss_b"],
    });

    expect(tx.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "IN_PROGRESS", workspaceId: WORKSPACE_ID },
      })
    );

    const sql = tx.$executeRaw.mock.calls[0][0] as { values: unknown[] };
    // iss_b 被丢弃（不在目标列也不是被拖卡片），iss_c/iss_d 追加在末尾
    expect(sql.values).toEqual(["iss_a", "iss_c", "iss_d", "IN_PROGRESS", WORKSPACE_ID]);
  });

  test("同列重排时保留客户端给的顺序，且清单成员不会作为「新出现的卡」在列尾重复", async () => {
    const tx = txMock();
    tx.issue.count.mockResolvedValue(2); // iss_c（被拖）+ iss_d，都在目标列
    tx.issue.findMany.mockResolvedValue([{ id: "iss_c" }, { id: "iss_d" }]);
    tx.$executeRaw.mockResolvedValue(2);
    withTransaction(tx);

    await moveIssueWithinWorkspace({
      workspaceId: WORKSPACE_ID,
      issueId: "iss_c",
      toStatus: "TODO",
      // 客户端把 iss_c 从首位拖到末位
      orderedIds: ["iss_d", "iss_c"],
    });

    const sql = tx.$executeRaw.mock.calls[0][0] as { values: unknown[] };
    // 顺序完全由客户端清单决定；两者都已在清单里，因此 appended 为空、不产生重复项
    expect(sql.values).toEqual(["iss_d", "iss_c", "TODO", WORKSPACE_ID]);
  });

  test("整列重写只发一条语句（这是 P0-5 的核心承诺）", async () => {
    const tx = txMock();
    tx.issue.count.mockResolvedValue(1);
    tx.issue.findMany.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(1);
    withTransaction(tx);

    await moveIssueWithinWorkspace({
      workspaceId: WORKSPACE_ID,
      issueId: "iss_a",
      toStatus: "DONE",
      orderedIds: ["iss_a"],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
