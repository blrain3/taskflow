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
  BACKLOG: "bg-zinc-100 text-zinc-700",
  TODO: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  DONE: "bg-emerald-50 text-emerald-700",
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
