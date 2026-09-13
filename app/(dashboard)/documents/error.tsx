"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * 错误态（DoD：失败后用户可以重试或恢复）。
 * error.tsx 必须是客户端组件，且只能拿到脱敏后的错误信息。
 * 放在 documents/ 这一层，列表页与详情页共用。
 */
export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[documents] 页面渲染失败", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-danger/30 bg-danger-subtle px-6 py-8 text-center">
      <p className="text-sm font-medium text-danger">文档加载失败</p>
      <p className="mt-1 text-sm text-danger">
        通常是数据库连接或权限校验出了问题，可以重试；持续失败请查看服务端日志。
      </p>
      <Button className="mt-4" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
