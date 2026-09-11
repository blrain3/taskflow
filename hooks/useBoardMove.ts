"use client";

import { useState } from "react";

import { moveIssue } from "@/actions/issue";
import type { MoveIssueInput } from "@/lib/validation";
import type { IssueItem } from "@/types/issue";

/**
 * 看板拖拽的乐观更新状态机（P0-09）。
 *
 * 职责边界：本 hook 只管「镜像 → 乐观提交 → 成功收敛 / 失败回滚 + 重试」，
 * 拖拽事件语义（快照时机、预演、取消还原）由 Board 组件编排。
 *
 * 镜像同步规则：服务端 props 是唯一真源，用「渲染期对齐」模式同步
 * （https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes）。
 * 以下三种情况暂停同步，避免覆盖本地状态：
 * 1. 拖拽进行中（syncPaused，预演状态不能被 RSC 刷新冲掉）；
 * 2. 有请求在途（pendingIds，乐观结果等待确认）；
 * 3. 失败提示未处理（moveError，回滚结果不能被旧 props 冲掉）。
 * 暂停期间不清除 synced 基准，恢复可同步后的下一次渲染会补齐。
 */

export type MoveFailure = {
  message: string;
  retry: () => void;
};

export function useBoardMove(serverIssues: IssueItem[]) {
  const [issues, setIssues] = useState(serverIssues);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [moveError, setMoveError] = useState<MoveFailure | null>(null);
  const [syncPaused, setSyncPaused] = useState(false);
  const [syncedServerIssues, setSyncedServerIssues] = useState(serverIssues);

  const canSync = !syncPaused && pendingIds.length === 0 && moveError === null;
  if (syncedServerIssues !== serverIssues && canSync) {
    setSyncedServerIssues(serverIssues);
    setIssues(serverIssues);
  }

  /**
   * 乐观提交一次移动。
   * @param payload    发给 moveIssue Action 的契约数据
   * @param optimistic 应用后的镜像（立即呈现）
   * @param rollbackTo 拖拽开始前的快照（失败时整体恢复，避免半新半旧）
   */
  async function commit(payload: MoveIssueInput, optimistic: IssueItem[], rollbackTo: IssueItem[]) {
    setMoveError(null);
    setIssues(optimistic);
    setPendingIds((prev) => [...prev, payload.issueId]);

    let failed = false;
    let message = "";
    try {
      const result = await moveIssue(payload);
      if (!result.ok) {
        failed = true;
        message = result.error.message;
      }
    } catch {
      // Server Action 网络层异常（断网/超时）会直接 reject，与业务失败同路径处理
      failed = true;
      message = "网络异常，请检查连接后重试";
    }

    setPendingIds((prev) => prev.filter((id) => id !== payload.issueId));
    if (!failed) {
      // revalidatePath 已在服务端触发 RSC 重取；pending 清空后镜像会与权威数据对齐
      return;
    }

    setIssues(rollbackTo);
    setMoveError({
      message,
      retry: () => {
        void commit(payload, optimistic, rollbackTo);
      },
    });
  }

  function dismissError() {
    setMoveError(null);
  }

  return { issues, setIssues, pendingIds, moveError, dismissError, setSyncPaused, commit };
}
