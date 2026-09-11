"use client";

import { useMemo, useRef, useState } from "react";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { BoardColumn, COLUMN_PREFIX } from "@/components/board/BoardColumn";
import { CardFace } from "@/components/board/IssueCard";
import { useBoardMove } from "@/hooks/useBoardMove";
import {
  ISSUE_STATUSES,
  groupIssuesByStatus,
  isIssueStatus,
  type IssueItem,
  type IssueStatusValue,
} from "@/types/issue";

/**
 * 四列看板（US-006 / P0-08 / P0-09）。
 *
 * 拖拽语义：
 * - onDragStart：快照整份镜像（取消/失败的还原基准），暂停 props 同步；
 * - onDragOver：跨列预演——把卡片的状态改成目标列，卡片立即出现在目标列；
 * - onDragEnd：算出目标列的最终顺序，乐观应用并调 moveIssue；
 *   原地放下（顺序与状态都没变）则不发请求；
 * - onDragCancel / 落在无效区域：恢复拖拽前快照，不发请求。
 */

export function Board({ issues: serverIssues }: { issues: IssueItem[] }) {
  const { issues, setIssues, pendingIds, moveError, dismissError, setSyncPaused, commit } =
    useBoardMove(serverIssues);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStartRef = useRef<IssueItem[]>([]);

  const sensors = useSensors(
    // 6px 激活距离：不吞点击（卡片上未来可能有查看详情等交互）
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grouped = useMemo(() => groupIssuesByStatus(issues), [issues]);
  const activeIssue = activeId ? (issues.find((issue) => issue.id === activeId) ?? null) : null;

  /** 落点 → 目标列：column:STATUS 是列容器，其余是卡片 id（取其当前状态） */
  function statusOfOver(overId: string): IssueStatusValue | null {
    if (overId.startsWith(COLUMN_PREFIX)) {
      const raw = overId.slice(COLUMN_PREFIX.length);
      return isIssueStatus(raw) ? raw : null;
    }
    return issues.find((issue) => issue.id === overId)?.status ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    dragStartRef.current = structuredClone(issues);
    setActiveId(String(event.active.id));
    setSyncPaused(true);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!activeId || !event.over) return;

    const toStatus = statusOfOver(String(event.over.id));
    const moving = issues.find((issue) => issue.id === activeId);
    if (!toStatus || !moving || moving.status === toStatus) return;

    setIssues((prev) =>
      prev.map((issue) => (issue.id === activeId ? { ...issue, status: toStatus } : issue))
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    setSyncPaused(false);
    const rollbackTo = dragStartRef.current;
    const currentId = activeId;
    setActiveId(null);

    const overId = event.over ? String(event.over.id) : null;
    const toStatus = overId ? statusOfOver(overId) : null;
    if (!currentId || !toStatus) {
      // 落在无效区域：与取消同语义
      setIssues(rollbackTo);
      return;
    }

    // 预演后镜像里卡片已在目标列；据落点算最终顺序
    const column = issues.filter((issue) => issue.status === toStatus);
    const fromIndex = column.findIndex((issue) => issue.id === currentId);
    const overIndex = column.findIndex((issue) => issue.id === overId);

    let reordered = column;
    if (overIndex >= 0) {
      if (fromIndex >= 0 && fromIndex !== overIndex) {
        reordered = arrayMove(column, fromIndex, overIndex);
      }
    } else if (fromIndex >= 0 && fromIndex !== column.length - 1) {
      // 落在列容器（空列/列尾空白）：去列尾
      reordered = arrayMove(column, fromIndex, column.length - 1);
    }

    const orderChanged = reordered.some((issue, index) => column[index]?.id !== issue.id);
    const original = rollbackTo.find((issue) => issue.id === currentId);
    const statusChanged = original !== undefined && original.status !== toStatus;
    if (!orderChanged && !statusChanged) return; // 原地放下：不发请求

    const optimistic = [
      ...issues.filter((issue) => issue.status !== toStatus),
      ...reordered.map((issue) =>
        issue.id === currentId ? { ...issue, status: toStatus } : issue
      ),
    ];

    void commit(
      { issueId: currentId, toStatus, orderedIds: reordered.map((issue) => issue.id) },
      optimistic,
      rollbackTo
    );
  }

  function handleDragCancel() {
    setSyncPaused(false);
    setActiveId(null);
    setIssues(dragStartRef.current);
  }

  return (
    <div className="mt-6">
      {moveError ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <span>{moveError.message}，已恢复拖动前的位置。</span>
          <button
            type="button"
            className="rounded border border-red-300 px-2 py-0.5 hover:bg-red-100"
            onClick={moveError.retry}
          >
            重试
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 underline underline-offset-2 hover:bg-red-100"
            onClick={dismissError}
          >
            忽略
          </button>
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ISSUE_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              items={grouped[status]}
              pendingIds={pendingIds}
            />
          ))}
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className="rotate-2">
              <CardFace issue={activeIssue} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
