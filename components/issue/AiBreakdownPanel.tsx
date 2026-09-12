"use client";

import { useRef, useState } from "react";

import { createIssuesFromSubtasksAction } from "@/actions/issue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/types/action";
import type { GeneratedSubtask } from "@/types/issue";

/**
 * AI 拆分 + 确认创建面板（US-007 / US-008 / P0-10 / P0-11）。
 *
 * 状态机：
 * idle → loading → success（可编辑/删除候选）→ creating → 回到 idle 并提示创建数
 * 拆分为两段：phase 描述「拆分流程」的显式阶段，creating 单独表示「批量创建请求在途」。
 * 二者刻意分开，因为创建期间候选列表必须继续可见（按钮换文案 + 禁用），
 * 若把 creating 并入 phase 单值，列表会被卸载，用户看不到正在提交的内容。
 *
 * 设计决策：
 * - AI 调用走 Route Handler（fetch），批量创建走 Server Action（直调）；
 * - creating 期间两个按钮都禁用，避免重复提交；
 * - 错误条只展示 ErrorCode 对应的安全文案，不透出堆栈或 prompt 内容。
 */
type Phase = "idle" | "loading" | "success";

type PanelError = { message: string };

type CreatedToast = { count: number; duplicate: boolean };

const MIN_PROMPT_LENGTH = 10;
const PROMPT_MAX_LENGTH = 4000;

/**
 * 生成批次标识。
 *
 * `crypto.randomUUID()` 只在**安全上下文**（HTTPS 或 localhost）存在；用
 * `http://<公网 IP>:3000` 打开时它是 undefined，直接调用会让「确认创建」抛错。
 * 因此这里退化为时间戳 + 随机串：requestId 只是幂等键（服务端要求 ≥8 位、
 * 只含 [A-Za-z0-9_-]、不能有冒号），不需要密码学强度。
 */
export function createRequestId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  return [
    "req",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

export function AiBreakdownPanel() {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [creating, setCreating] = useState(false);
  const [subtasks, setSubtasks] = useState<GeneratedSubtask[]>([]);
  const [error, setError] = useState<PanelError | null>(null);
  const [created, setCreated] = useState<CreatedToast | null>(null);

  const trimmed = prompt.trim();
  const canBreakdown = trimmed.length >= MIN_PROMPT_LENGTH && phase !== "loading" && !creating;

  /**
   * 幂等键：一批候选用一个 requestId，服务端据此生成确定性主键。
   * 因此「网络抖动后用户再点一次确认」会命中同一批次而不是创建两份。
   * 惰性生成（而非 useState 初值），避免 SSR 与客户端各自生成导致的不一致。
   */
  const requestIdRef = useRef<string | null>(null);
  function currentRequestId(): string {
    if (requestIdRef.current === null) {
      requestIdRef.current = createRequestId();
    }
    return requestIdRef.current;
  }

  function startNewBatch() {
    requestIdRef.current = null;
  }

  async function handleBreakdown() {
    setError(null);
    setCreated(null);
    setPhase("loading");
    try {
      const response = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const payload = (await response.json()) as ActionResult<{ subtasks: GeneratedSubtask[] }>;
      if (!payload.ok) {
        setError({ message: payload.error.message });
        setPhase("idle");
        return;
      }
      // 新一批候选 = 新一个批次标识，避免与上一批的幂等键混用
      startNewBatch();
      setSubtasks(payload.data.subtasks);
      setPhase("success");
    } catch (caught) {
      setError({
        message: caught instanceof Error ? `网络异常：${caught.message}` : "网络异常，请稍后重试",
      });
      setPhase("idle");
    }
  }

  async function handleCreate() {
    setError(null);
    setCreated(null);
    setCreating(true);
    try {
      // 沿用同一 requestId：网络抖动后的重试会命中服务端幂等，不会创建两份
      const result = await createIssuesFromSubtasksAction({
        requestId: currentRequestId(),
        subtasks,
      });
      if (!result.ok) {
        // 失败保留候选项与用户编辑，方便直接重试
        setError({ message: result.error.message });
        return;
      }
      setCreated({ count: result.data.createdCount, duplicate: result.data.duplicate });
      setSubtasks([]);
      setPrompt("");
      setPhase("idle");
      startNewBatch();
    } catch (caught) {
      setError({
        message: caught instanceof Error ? `网络异常：${caught.message}` : "网络异常，请稍后重试",
      });
    } finally {
      setCreating(false);
    }
  }

  function updateSubtask(index: number, patch: Partial<GeneratedSubtask>) {
    setSubtasks((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeSubtask(index: number) {
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <section
      className="mt-6 rounded-lg border border-zinc-200 p-4"
      aria-labelledby="ai-breakdown-heading"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-800" id="ai-breakdown-heading">
          AI 拆分任务
        </h2>
        <span className="text-xs text-zinc-500">
          描述一段工作，AI 拆出可执行子任务，确认后批量创建
        </span>
      </header>

      <div className="mt-3">
        <Label className="block" htmlFor="ai-prompt">
          工作描述
        </Label>
        <Textarea
          id="ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          maxLength={PROMPT_MAX_LENGTH}
          disabled={phase === "loading" || creating}
          placeholder="例如：实现 OAuth2 登录，支持邮箱 + GitHub 两种方式"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-fg-muted">
          至少 {MIN_PROMPT_LENGTH} 个字符，最多 {PROMPT_MAX_LENGTH} 个字符
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleBreakdown} disabled={!canBreakdown}>
          {phase === "loading" ? "AI 拆分中…" : "AI 拆分"}
        </Button>

        {phase === "success" && subtasks.length > 0 ? (
          <Button type="button" onClick={handleCreate} disabled={creating} variant="secondary">
            {creating ? "创建中…" : `确认创建 ${subtasks.length} 个任务`}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error.message}
        </p>
      ) : null}

      {created ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-success/30 bg-status-done-subtle px-3 py-2 text-sm text-success"
        >
          {created.duplicate
            ? `该批次已创建过，未重复写入（共 ${created.count} 个任务）`
            : `已创建 ${created.count} 个任务`}
        </p>
      ) : null}

      {phase === "success" && subtasks.length > 0 ? (
        <ul className="mt-4 space-y-3" aria-label="AI 拆分候选子任务">
          {subtasks.map((item, index) => (
            <li key={index} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <Badge>#{index + 1}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSubtask(index)}
                  disabled={creating}
                >
                  删除
                </Button>
              </div>
              <Input
                type="text"
                value={item.title}
                onChange={(event) => updateSubtask(index, { title: event.target.value })}
                maxLength={200}
                disabled={creating}
                className="mt-1 font-medium"
                aria-label={`子任务 ${index + 1} 标题`}
              />
              <Textarea
                value={item.description ?? ""}
                onChange={(event) =>
                  updateSubtask(index, {
                    description: event.target.value.length === 0 ? null : event.target.value,
                  })
                }
                rows={2}
                maxLength={2000}
                disabled={creating}
                className="mt-2 min-h-0 text-xs"
                aria-label={`子任务 ${index + 1} 描述`}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
