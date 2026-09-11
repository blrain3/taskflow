import { z } from "zod";

import { ISSUE_STATUSES } from "@/types/issue";

/**
 * 唯一校验真源（docs/architecture.md §6 Validation 模块）。
 * 前后端共用：服务端在 Action 内校验，客户端表单可复用同一份规则做即时反馈。
 * 注意：本文件不导入 server-only，也不读取环境变量。
 */

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 64;
export const WORKSPACE_NAME_MAX_LENGTH = 50;

/** 邮箱：先 trim + 小写归一，再校验格式，保证注册与登录的大小写行为一致 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, { error: `邮箱长度不能超过 ${EMAIL_MAX_LENGTH} 个字符` })
  .pipe(z.email({ error: "请输入有效的邮箱地址" }));

/** 注册用密码强度规则 */
export const passwordSchema = z
  .string()
  .min(8, { error: "密码至少 8 位" })
  .max(PASSWORD_MAX_LENGTH, { error: `密码不能超过 ${PASSWORD_MAX_LENGTH} 位` })
  .regex(/[a-zA-Z]/, { error: "密码需包含至少一个字母" })
  .regex(/[0-9]/, { error: "密码需包含至少一个数字" });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "请输入昵称" })
  .max(30, { error: "昵称不能超过 30 个字符" });

export const registerSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** 登录只要求非空：强度规则属于注册，不应把老账号挡在门外 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "请输入密码" }),
});

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, { error: "请输入工作区名称" })
  .max(WORKSPACE_NAME_MAX_LENGTH, { error: `名称不能超过 ${WORKSPACE_NAME_MAX_LENGTH} 个字符` });

// ---- Issue ----

export const ISSUE_TITLE_MAX_LENGTH = 200;
export const ISSUE_DESCRIPTION_MAX_LENGTH = 2000;

/** 状态枚举取自 types/issue.ts 的单一真源，避免两处定义漂移 */
export const issueStatusSchema = z.enum(ISSUE_STATUSES, { error: "任务状态不合法" });

export const issueTitleSchema = z
  .string()
  .trim()
  .min(1, { error: "请输入任务标题" })
  .max(ISSUE_TITLE_MAX_LENGTH, { error: `标题不能超过 ${ISSUE_TITLE_MAX_LENGTH} 个字符` });

/** 描述允许留空：空字符串统一归一为 null，避免库里出现语义重复的两种「空」 */
export const issueDescriptionSchema = z
  .string()
  .trim()
  .max(ISSUE_DESCRIPTION_MAX_LENGTH, {
    error: `描述不能超过 ${ISSUE_DESCRIPTION_MAX_LENGTH} 个字符`,
  })
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const createIssueSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema.optional(),
});

export const updateIssueSchema = z.object({
  id: z.string().trim().min(1, { error: "缺少任务 ID" }),
  title: issueTitleSchema,
  description: issueDescriptionSchema.optional(),
  status: issueStatusSchema,
});

export const deleteIssueSchema = z.object({
  id: z.string().trim().min(1, { error: "缺少任务 ID" }),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type DeleteIssueInput = z.infer<typeof deleteIssueSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** 把 ZodError 压成「字段名 → 首条提示」，供 ActionResult.error.fields 使用 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
