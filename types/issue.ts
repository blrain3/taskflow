/**
 * Issue 领域类型（客户端与服务端共用的契约）。
 *
 * 日期使用 ISO 字符串而非 Date：服务端组件把数据传给客户端组件时只保证可序列化，
 * 显式转成字符串可以避免两端对时区/格式的隐式假设。
 */

export const ISSUE_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "DONE"] as const;

export type IssueStatusValue = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABELS: Record<IssueStatusValue, string> = {
  BACKLOG: "待整理",
  TODO: "待开始",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
};

/** 徽标配色：中文股票约定下「已完成」用绿，进程类用蓝/琥珀 */
export const ISSUE_STATUS_STYLES: Record<IssueStatusValue, string> = {
  BACKLOG: "bg-status-backlog-subtle text-status-backlog",
  TODO: "bg-status-todo-subtle text-status-todo",
  IN_PROGRESS: "bg-status-progress-subtle text-status-progress",
  DONE: "bg-status-done-subtle text-status-done",
};

export type IssueItem = {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatusValue;
  createdAt: string;
  updatedAt: string;
};

export function isIssueStatus(value: unknown): value is IssueStatusValue {
  return typeof value === "string" && (ISSUE_STATUSES as readonly string[]).includes(value);
}

/** 看板分列：按状态的列分组，列内顺序保持传入顺序（服务端已按 position 排好） */
export function groupIssuesByStatus(
  issues: readonly IssueItem[]
): Record<IssueStatusValue, IssueItem[]> {
  const groups: Record<IssueStatusValue, IssueItem[]> = {
    BACKLOG: [],
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
  };
  for (const issue of issues) {
    groups[issue.status].push(issue);
  }
  return groups;
}

/**
 * AI 拆分的子任务契约（与 Issue 共享 title/description 长度约束）。
 * 客户端与服务端共用：AI 输出经 Zod 强校验后转成此结构；用户在面板上编辑/删除候选也是它。
 */
export type GeneratedSubtask = {
  title: string;
  description?: string | null;
};
