"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { IssueItem } from "@/types/issue";

/**
 * 卡片视觉（纯展示）：列表里的可排序卡片、DragOverlay 里的提起态共用同一张脸。
 * 列内已隐含状态，卡面上不再重复状态徽标。
 */
export function CardFace({
  issue,
  pending = false,
  overlay = false,
}: {
  issue: IssueItem;
  pending?: boolean;
  overlay?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-raised px-3 py-2 ${
        overlay ? "border-line-strong shadow-elev-2" : "border-line"
      } ${pending ? "opacity-50" : ""}`}
    >
      <p className="text-sm font-medium text-fg">{issue.title}</p>
      {issue.description ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{issue.description}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-fg-subtle">{issue.createdAt.slice(0, 10)}</p>
      {pending ? <p className="mt-0.5 text-[11px] text-warning">同步中…</p> : null}
    </div>
  );
}

/** 可排序卡片：useSortable 同时承担拖拽句柄与键盘可达（Space 提起、方向键移动） */
export function SortableIssueCard({ issue, pending }: { issue: IssueItem; pending: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    // 请求在途时禁拖：连续拖拽以「请求完成后」为准，避免同一卡片乱序提交
    disabled: pending,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
        isDragging ? "opacity-40" : ""
      }`}
      aria-label={`任务：${issue.title}`}
    >
      <CardFace issue={issue} pending={pending} />
    </div>
  );
}
