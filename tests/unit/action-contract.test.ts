import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeDefaultWorkspace, ROUTES, runAction } from "@/actions/_contract";
import type { ActionContract } from "@/actions/_contract";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ensureWorkspaceForUser } from "@/lib/permissions";

/**
 * 四步契约封装的单测（架构评审 P1-3）。
 *
 * 为什么必须测这个函数：它现在是**每一个写入口**的公共路径，一旦这里出错，故障面是全部
 * 写操作。而重构的目标恰恰是「漏步骤在结构上不可能发生」——那就要把「顺序」本身钉住，
 * 而不是只测各个 Action 的业务结果。
 *
 * 依赖全部 mock，不需要数据库；这也是本项目在容器不可用时仍能验证服务端逻辑的方式。
 */
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/permissions", () => ({ ensureWorkspaceForUser: jest.fn() }));

const mockedRevalidatePath = jest.mocked(revalidatePath);
const mockedRequireUser = jest.mocked(requireUser);
const mockedEnsureWorkspace = jest.mocked(ensureWorkspaceForUser);

const schema = z.object({ title: z.string().min(1, { error: "请输入标题" }) });

type Auth = { workspaceId: string };

/**
 * 用显式泛型参数构造契约。刻意不用 `Parameters<typeof runAction>[0]`——
 * 那会把泛型抹成 unknown，回调里的 input 就失去类型，tsc 会直接报错。
 */
function baseContract<Output = string>(
  overrides: Partial<ActionContract<typeof schema, Output, Auth>> = {}
): ActionContract<typeof schema, Output, Auth> {
  return {
    schema,
    rawInput: { title: "写点东西" },
    validationMessage: "请检查填写内容",
    authorize: async () => ({ workspaceId: "ws_1" }),
    run: async () => "done" as Output,
    revalidate: () => [ROUTES.issues],
    ...overrides,
  };
}

describe("写入口四步契约 runAction", () => {
  test("校验失败返回字段级错误，且不进入鉴权", async () => {
    const authorize = jest.fn(async () => ({ workspaceId: "ws_1" }));

    const result = await runAction(baseContract({ rawInput: { title: "" }, authorize }));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "请检查填写内容",
        fields: { title: "请输入标题" },
      },
    });
    // 顺序保证：校验不通过就不该读取会话，避免无效请求触发鉴权开销
    expect(authorize).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("鉴权失败被收敛为 UNAUTHORIZED，且不失效缓存", async () => {
    const result = await runAction(
      baseContract({
        authorize: async () => {
          throw new AppError("UNAUTHORIZED");
        },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("业务异常被收敛为对应错误码（跨工作区语义）", async () => {
    const result = await runAction(
      baseContract({
        run: async () => {
          throw new AppError("NOT_FOUND");
        },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  test("未知异常降级为 INTERNAL，且不透出原始信息", async () => {
    const result = await runAction(
      baseContract({
        run: async () => {
          throw new Error("database password=secret");
        },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.message).not.toContain("secret");
    }
  });

  test("成功时返回数据，并按契约顺序失效全部路由", async () => {
    const result = await runAction(
      baseContract<{ echoed: string }>({
        run: async (input) => ({ echoed: input.title }),
        revalidate: () => [ROUTES.issues, ROUTES.documents],
      })
    );

    expect(result).toEqual({ ok: true, data: { echoed: "写点东西" } });
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(1, "/issues");
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(2, "/documents");
  });

  test("revalidate 返回空数组时不调用失效", async () => {
    const result = await runAction(baseContract({ revalidate: () => [] }));

    expect(result.ok).toBe(true);
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("authorize 拿到的是校验后的数据，业务看到同一个授权上下文", async () => {
    const seen: unknown[] = [];

    await runAction(
      baseContract<null>({
        authorize: async (input) => {
          seen.push(["authorize", input]);
          return { workspaceId: "ws_42" };
        },
        run: async (input, auth) => {
          seen.push(["run", input, auth]);
          return null;
        },
      })
    );

    expect(seen[0]).toEqual(["authorize", { title: "写点东西" }]);
    expect(seen[1]).toEqual(["run", { title: "写点东西" }, { workspaceId: "ws_42" }]);
  });
});

describe("默认工作区授权", () => {
  test("从会话推导 workspaceId，供写库直接使用", async () => {
    mockedRequireUser.mockResolvedValue({ id: "u1", email: "a@b.c", name: "阿甲" });
    mockedEnsureWorkspace.mockResolvedValue({
      id: "ws_default_u1",
      name: "阿甲 的工作区",
      role: "OWNER",
    });

    await expect(authorizeDefaultWorkspace()).resolves.toEqual({ workspaceId: "ws_default_u1" });
    expect(mockedEnsureWorkspace).toHaveBeenCalledWith("u1", "阿甲");
  });
});

describe("路由常量", () => {
  test("文档详情路径由 id 拼出，避免字面量散落", () => {
    expect(ROUTES.issues).toBe("/issues");
    expect(ROUTES.documents).toBe("/documents");
    expect(ROUTES.documentDetail("doc_1")).toBe("/documents/doc_1");
  });
});
