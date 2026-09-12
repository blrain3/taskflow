"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * 根级错误边界（US-005 / DoD：失败后用户可以重试或恢复）。
 * 兜住 issues/error.tsx 之外的任意路由段渲染错误，避免落到 Next 默认错误页（暴露 digest）。
 * error 对象只有 message 与 digest，不包含堆栈——细节只在服务端日志。
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] 页面渲染失败", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-danger/30 bg-danger-subtle px-6 py-8 text-center">
        <p className="text-sm font-medium text-danger">页面出了点问题</p>
        <p className="mt-1 text-sm text-danger">可以重试；持续失败请查看服务端日志。</p>
        <Button className="mt-4" onClick={reset}>
          重试
        </Button>
      </div>
    </div>
  );
}
