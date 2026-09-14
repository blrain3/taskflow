import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireUser } from "@/lib/auth";
import { toActionError } from "@/lib/errors";
import { ensureWorkspaceForUser } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/validation";
import type { ActionResult } from "@/types/action";

/**
 * 写入口的四步契约统一封装（架构评审 P1-3）。
 *
 * 为什么需要它：原先每个 Action 各自手写「safeParse → 鉴权 → 授权 → 执行 → revalidatePath」
 * 五段样板，同一文件里复制了五份。复制粘贴维持契约的真实代价不是啰嗦，而是**新增 Action 时
 * 最容易漏掉 revalidatePath** —— 而漏掉不会报错，只会表现为「保存成功但列表不刷新」，
 * 属于最难排查的一类缺陷。把顺序固化在一个函数里，漏步骤在结构上就不可能发生。
 *
 * 这个文件刻意**不带 `"use server"`**：它是一个普通模块，由 actions/ 下的 Action 文件导入。
 * 带指令的模块只能导出 async 函数，而这里需要导出 ROUTES 常量与类型。
 */

/**
 * React Server Component 路由常量（架构评审 P1-4）。
 *
 * 写操作失效缓存时只允许引用这里的值，不再在各处写 `"/issues"` 这类字面量——
 * 路由一旦调整，字面量会散落成多个漏改点，而漏改同样不会报错。
 */
export const ROUTES = {
  issues: "/issues",
  documents: "/documents",
  documentDetail: (documentId: string) => `/documents/${documentId}`,
} as const;

/**
 * 第 2、3 步的默认实现：鉴权取会话，授权推导出「当前默认工作区」。
 *
 * 返回的 workspaceId 就是后续写库**必须**使用的工作区。适用于「目标对象尚未确定或由服务端
 * 自行归置」的场景（如创建 Issue）。若目标对象已存在，授权必须改为「按目标对象推导工作区」
 * ——见文档域的 assertDocumentAccess，那是「授权与写入同源」的范例。
 */
export async function authorizeDefaultWorkspace(): Promise<{ workspaceId: string }> {
  const user = await requireUser();
  const workspace = await ensureWorkspaceForUser(user.id, user.name);
  return { workspaceId: workspace.id };
}

/**
 * 一次写入口的完整契约描述。
 *
 * 入参类型刻意从 schema 自身推导（`z.output<S>`）而不是额外声明一个泛型：
 * 含 `.transform()` 的 schema 其输入与输出类型并不相同，分别声明容易写错，
 * 从 schema 推导可以保证「校验后的数据形状」永远与业务函数看到的形状一致。
 *
 * - `authorize`：第 2、3 步，接收**已校验**的入参（授权常常需要目标 id）；
 * - `run`：第 4 步的业务部分，只写业务，不关心鉴权与错误收敛；
 * - `revalidate`：第 4 步的缓存失效部分，返回需要失效的路由列表（可为空数组）。
 */
export type ActionContract<S extends z.ZodType, Output, Auth> = {
  schema: S;
  rawInput: unknown;
  /** 校验失败时对用户展示的文案；字段级错误会自动带上 */
  validationMessage: string;
  authorize: (input: z.output<S>) => Promise<Auth>;
  run: (input: z.output<S>, auth: Auth) => Promise<Output>;
  revalidate: (output: Output, auth: Auth) => readonly string[];
};

/**
 * 执行一次写入口。返回契约恒为 ActionResult，绝不向客户端抛原始异常。
 *
 * 顺序与错误语义与重构前严格一致：鉴权失败与业务异常走同一条 toActionError 收敛路径
 * （未登录得到 UNAUTHORIZED、跨工作区得到 NOT_FOUND），因此客户端所见行为不变。
 */
export async function runAction<S extends z.ZodType, Output, Auth>(
  contract: ActionContract<S, Output, Auth>
): Promise<ActionResult<Output>> {
  const parsed = contract.schema.safeParse(contract.rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: contract.validationMessage,
        fields: fieldErrorsOf(parsed.error),
      },
    };
  }

  try {
    const auth = await contract.authorize(parsed.data);
    const output = await contract.run(parsed.data, auth);

    for (const path of contract.revalidate(output, auth)) {
      revalidatePath(path);
    }

    return { ok: true, data: output };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
