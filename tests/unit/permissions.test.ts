import { assertWorkspaceAccess, ensureWorkspaceForUser } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

/**
 * Workspace 归属判定与初始化单测（架构评审 P1-6）。
 *
 * 为什么这两条路径必须有测试：
 * - `ensureWorkspaceForUser` 曾因 Next 并发渲染 layout 与 page 而**重复创建工作区**，
 *   现在靠「确定性 ID + upsert + P2002 兜底」收敛。这个并发保证只存在于代码结构里，
 *   一旦有人把 upsert 改回 create，回归不会体现在任何返回值上；
 * - `assertWorkspaceAccess` 是跨工作区越权的唯一闸门，不属于该工作区时必须抛 FORBIDDEN。
 *
 * 全部依赖 mock，不连数据库。
 */
jest.mock("@/lib/prisma", () => ({ getPrisma: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireUserOrRedirect: jest.fn() }));

const mockedGetPrisma = jest.mocked(getPrisma);

type MemberRow = { role: string; workspace: { id: string; name: string } };

type MockClient = {
  workspaceMember: {
    findFirst: jest.Mock<Promise<MemberRow | null>>;
    findUnique: jest.Mock<Promise<MemberRow | null>>;
  };
  $transaction: jest.Mock;
};

function mockClient(): MockClient {
  return {
    workspaceMember: {
      findFirst: jest.fn<Promise<MemberRow | null>, []>(),
      findUnique: jest.fn<Promise<MemberRow | null>, []>(),
    },
    $transaction: jest.fn(),
  };
}

function install(db: MockClient) {
  mockedGetPrisma.mockReturnValue(db as unknown as ReturnType<typeof getPrisma>);
}

/** 让 $transaction 直接把伪造的事务客户端交给回调 */
function transactionWith(tx: unknown): jest.Mock {
  return jest.fn(async (callback: (client: unknown) => unknown) => callback(tx));
}

beforeEach(() => {
  mockedGetPrisma.mockReset();
});

describe("ensureWorkspaceForUser", () => {
  test("已有成员关系时直接返回，不触发创建", async () => {
    const db = mockClient();
    db.workspaceMember.findFirst.mockResolvedValue({
      role: "OWNER",
      workspace: { id: "ws_default_u1", name: "我的工作区" },
    });
    install(db);

    await expect(ensureWorkspaceForUser("u1", "阿甲")).resolves.toEqual({
      id: "ws_default_u1",
      name: "我的工作区",
      role: "OWNER",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test("首次进入用确定性 ID + upsert，使并发渲染收敛成一条记录", async () => {
    const db = mockClient();
    db.workspaceMember.findFirst.mockResolvedValue(null);

    const tx = {
      workspace: {
        upsert: jest.fn().mockResolvedValue({ id: "ws_default_u1", name: "阿甲 的工作区" }),
      },
      workspaceMember: { upsert: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = transactionWith(tx);
    install(db);

    await expect(ensureWorkspaceForUser("u1", "阿甲")).resolves.toEqual({
      id: "ws_default_u1",
      name: "阿甲 的工作区",
      role: "OWNER",
    });

    // 关键断言：主键必须是「由 userId 推导的确定值」而不是随机值——
    // 并发两次调用会撞同一主键并由 upsert 收敛，这正是不再重复建工作区的原因
    expect(tx.workspace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws_default_u1" },
        create: expect.objectContaining({ id: "ws_default_u1", ownerId: "u1" }),
      })
    );
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: "ws_default_u1", userId: "u1" } },
        create: expect.objectContaining({ role: "OWNER" }),
      })
    );
  });

  test("没有显示名时回落默认工作区名", async () => {
    const db = mockClient();
    db.workspaceMember.findFirst.mockResolvedValue(null);

    const tx = {
      workspace: {
        upsert: jest.fn().mockResolvedValue({ id: "ws_default_u1", name: "我的工作区" }),
      },
      workspaceMember: { upsert: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = transactionWith(tx);
    install(db);

    await ensureWorkspaceForUser("u1", null);

    expect(tx.workspace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ name: "我的工作区" }) })
    );
  });

  test("并发落败方撞 P2002 时读回既有记录，而不是把异常抛给用户", async () => {
    const db = mockClient();
    db.workspaceMember.findFirst
      .mockResolvedValueOnce(null) // 首次查询：还没建
      .mockResolvedValueOnce({
        role: "OWNER",
        workspace: { id: "ws_default_u1", name: "我的工作区" },
      }); // 冲突后重查：对方已建好

    db.$transaction = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("unique constraint"), { code: "P2002" }));
    install(db);

    await expect(ensureWorkspaceForUser("u1", "阿甲")).resolves.toEqual({
      id: "ws_default_u1",
      name: "我的工作区",
      role: "OWNER",
    });
    expect(db.workspaceMember.findFirst).toHaveBeenCalledTimes(2);
  });

  test("非唯一约束的错误照常上抛，不吞掉真实故障", async () => {
    const db = mockClient();
    db.workspaceMember.findFirst.mockResolvedValue(null);
    db.$transaction = jest.fn().mockRejectedValue(new Error("connection lost"));
    install(db);

    await expect(ensureWorkspaceForUser("u1", "阿甲")).rejects.toThrow("connection lost");
  });
});

describe("assertWorkspaceAccess", () => {
  test("是成员时返回工作区摘要", async () => {
    const db = mockClient();
    db.workspaceMember.findUnique.mockResolvedValue({
      role: "EDITOR",
      workspace: { id: "ws_1", name: "团队空间" },
    });
    install(db);

    await expect(assertWorkspaceAccess("u1", "ws_1")).resolves.toEqual({
      id: "ws_1",
      name: "团队空间",
      role: "EDITOR",
    });
    expect(db.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: "ws_1", userId: "u1" } },
      })
    );
  });

  test("不是成员时抛 FORBIDDEN —— 跨工作区越权的唯一闸门", async () => {
    const db = mockClient();
    db.workspaceMember.findUnique.mockResolvedValue(null);
    install(db);

    await expect(assertWorkspaceAccess("u1", "ws_other")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
