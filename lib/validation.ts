import { z } from "zod";

import { ISSUE_STATUSES } from "@/types/issue";

/**
 * 唯一校验真源（docs/02-architecture/architecture.md §6 Validation 模块）。
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

// ---- Document ----

export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const DOCUMENT_CONTENT_MAX_LENGTH = 200_000;
export const DOCUMENT_SUMMARY_MAX_LENGTH = 2_000;

export const documentTitleSchema = z
  .string()
  .trim()
  .min(1, { error: "请输入文档标题" })
  .max(DOCUMENT_TITLE_MAX_LENGTH, { error: `标题不能超过 ${DOCUMENT_TITLE_MAX_LENGTH} 个字符` });

export const documentContentSchema = z.string().max(DOCUMENT_CONTENT_MAX_LENGTH, {
  error: `正文不能超过 ${DOCUMENT_CONTENT_MAX_LENGTH} 个字符`,
});

export const documentSummarySchema = z
  .string()
  .trim()
  .max(DOCUMENT_SUMMARY_MAX_LENGTH, { error: `摘要不能超过 ${DOCUMENT_SUMMARY_MAX_LENGTH} 个字符` })
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const documentFormatSchema = z.enum(["MARKDOWN", "RICH_TEXT"], {
  error: "文档格式不合法",
});

/**
 * 新建文档入参。**刻意不接收 workspaceId**——工作区一律由服务端从会话推导
 * （见 lib/permissions.ts「绝不信任客户端传入的值」），客户端传什么都不参与写入。
 */
export const createDocumentSchema = z.object({
  title: documentTitleSchema,
  content: documentContentSchema.default(""),
  summary: documentSummarySchema.optional(),
  format: documentFormatSchema.default("MARKDOWN"),
});

export const saveDocumentSchema = z.object({
  id: z.string().trim().min(1, { error: "缺少文档 ID" }),
  title: documentTitleSchema,
  content: documentContentSchema,
  summary: documentSummarySchema.optional(),
  format: documentFormatSchema,
  baseVersion: z.number().int().min(1, { error: "文档版本不合法" }),
});

export const aiSummarizeRequestSchema = z.object({
  documentId: z.string().trim().min(1, { error: "缺少文档 ID" }),
});

export const restoreDocumentVersionSchema = z.object({
  documentId: z.string().trim().min(1, { error: "缺少文档 ID" }),
  version: z.number().int().min(1, { error: "版本号不合法" }),
  baseVersion: z.number().int().min(1, { error: "文档版本不合法" }),
});

/**
 * AI 摘要写入：`summary` 用 documentSummarySchema（空串归一为 null，即显式清空）。
 * 刻意**不含 baseVersion**——摘要属于元数据而非正文，写入不递增 contentVersion、
 * 不产生版本记录，因此也不会让编辑器正在持有的乐观锁失效（否则下一次自动保存必冲突）。
 */
export const applyDocumentSummarySchema = z.object({
  documentId: z.string().trim().min(1, { error: "缺少文档 ID" }),
  summary: documentSummarySchema,
});

// ---- Issue ----

export const ISSUE_TITLE_MAX_LENGTH = 200;
export const ISSUE_DESCRIPTION_MAX_LENGTH = 2000;
/** AI 拆分输入的长度契约（与 aiBreakdownRequestSchema 保持同一真源） */
export const PROMPT_MIN_LENGTH = 10;
export const PROMPT_MAX_LENGTH = 4000;

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

/**
 * 看板拖拽落点（P0-09）。orderedIds 是目标列的完整顺序（含被拖卡片）：
 * 发整列而非「前后邻居中点值」，可避免浮点精度衰减，且并发语义清晰（整列覆盖，后写者赢）。
 * 单个 id 限定长度：cuid 约 25 字符，64 已宽裕；不设上限会让恶意请求用超长 id
 * 撑大 IN 查询的语句与参数体积。
 */
export const moveIssueSchema = z.object({
  issueId: z.string().trim().min(1, { error: "缺少任务 ID" }),
  toStatus: issueStatusSchema,
  orderedIds: z
    .array(z.string().trim().min(1).max(64, { error: "任务 ID 不合法" }))
    .min(1, { error: "缺少排序列表" })
    .max(500, { error: "单列任务数超出上限" }),
});

/**
 * AI 拆分子任务契约（P0-10 / P0-11）。
 * 单条记录由 generatedSubtaskSchema 约束；**条数下限分两处**：
 * - AI 输出走 aiOutputSubtasksSchema（3-10，校验上游质量）；
 * - 用户确认提交走 generatedSubtasksSchema（1-10，尊重用户删减）。
 * 这两者刻意不同，混用会让「删除候选」变成一条死路。
 */
export const generatedSubtaskSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema.optional(),
});

/**
 * AI 输出的条数契约：Prompt 要求 3-10 条，这里做强制校验，
 * 让「返回 3-10 条结构化子任务」这条对外契约真正成立——条数不合规等于输出不可用（零写入）。
 */
export const aiOutputSubtasksSchema = z
  .array(generatedSubtaskSchema)
  .min(3, { error: "AI 输出少于 3 条子任务" })
  .max(10, { error: "AI 输出超过 10 条子任务" });

/**
 * 批量创建的入参契约：**允许删到 1 条**。
 * 用户在确认前有权只保留自己认可的子任务（验收要求「结果可查看/编辑/删除单条」），
 * 所以这里不能沿用 AI 侧的 3 条下限——否则用户删到 2 条后点确认会得到一个无法自救的报错。
 */
export const generatedSubtasksSchema = z
  .array(generatedSubtaskSchema)
  .min(1, { error: "至少需要保留一条子任务" })
  .max(10, { error: "单次最多创建 10 条子任务" });

/**
 * 批量创建入参（P0-11）。
 *
 * requestId 是幂等键：客户端每次「得到一批 AI 候选」时生成一个随机标识，
 * 服务端据此生成确定性主键（`<requestId>:<index>`），重复提交同一批次不会产生重复任务。
 * 这就是 P0-11 验收 ④「重复点击确认不产生重复 Issue」的服务端那一半保证。
 *
 * 约束说明：
 * - 限定字符集且**禁止冒号**——requestId 会被拼进主键并用冒号做分隔符，含冒号会让前缀解析歧义；
 * - 不要求 UUID：`crypto.randomUUID()` 只在安全上下文可用（HTTP + 公网 IP 下为 undefined），
 *   客户端有兜底生成，服务端只约束「像键一样安全」而不绑定具体形状；
 * - 它不是安全令牌，可预测性不构成风险（跨 Workspace 的重放会在归属校验处被拒）。
 */
export const requestIdSchema = z
  .string()
  .trim()
  .min(8, { error: "批次标识过短" })
  .max(64, { error: "批次标识过长" })
  .regex(/^[A-Za-z0-9_-]+$/, { error: "批次标识只能包含字母、数字、连字符与下划线" });

export const createIssuesFromSubtasksSchema = z.object({
  requestId: requestIdSchema,
  subtasks: generatedSubtasksSchema,
});

export const aiBreakdownRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(PROMPT_MIN_LENGTH, { error: "请输入至少 10 个字符的描述" })
    .max(PROMPT_MAX_LENGTH, { error: "描述不能超过 4000 个字符" }),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;
export type RestoreDocumentVersionInput = z.infer<typeof restoreDocumentVersionSchema>;
export type ApplyDocumentSummaryInput = z.infer<typeof applyDocumentSummarySchema>;

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type DeleteIssueInput = z.infer<typeof deleteIssueSchema>;
export type MoveIssueInput = z.infer<typeof moveIssueSchema>;
export type GeneratedSubtaskInput = z.infer<typeof generatedSubtaskSchema>;
export type CreateIssuesFromSubtasksInput = z.infer<typeof createIssuesFromSubtasksSchema>;
export type AiOutputSubtasks = z.infer<typeof aiOutputSubtasksSchema>;

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
