"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { SortableIssueCard } from "@/components/board/IssueCard";
import {
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_STYLES,
  type IssueItem,
  type IssueStatusValue,
} from "@/types/issue";

/** 列 ID 前缀：与卡片 cuid 区分，statusOfOver() 依此判断落点是列容器还是卡片 */
export const COLUMN_PREFIX = "column:";

/**
 * 看板列（P0-08）：由状态派生，不落库。
 * 列自身是 droppable（空列/列尾也能落），列内卡片走 SortableContext 排序。
 */
export function BoardColumn({
  status,
  items,
  pendingIds,
}: {
  status: IssueStatusValue;
  items: IssueItem[];
  pendingIds: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  const label = ISSUE_STATUS_LABELS[status];

  return (
    <section
      ref={setNodeRef}
      aria-label={`${label}列，共 ${items.length} 个任务`}
      className={`flex min-h-44 flex-col rounded-lg border p-2 transition-colors ${
        isOver ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <header className="flex items-center justify-between px-1 pb-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ISSUE_STATUS_STYLES[status]}`}
        >
          {label}
        </span>
        <span className="text-xs text-zinc-400">{items.length}</span>
      </header>

      <SortableContext
        items={items.map((issue) => issue.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-1 flex-col gap-2">
          {items.map((issue) => (
            <li key={issue.id}>
              <SortableIssueCard issue={issue} pending={pendingIds.includes(issue.id)} />
            </li>
          ))}
        </ul>
      </SortableContext>

      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-zinc-300 px-2 py-6 text-center text-xs text-zinc-500">
          拖一张卡片到这里
        </p>
      ) : null}
    </section>
  );
}
