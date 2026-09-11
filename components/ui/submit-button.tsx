"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * 提交按钮：请求期间自动禁用，满足 US-008「重复点击不产生重复数据」
 * 与 DoD「提交按钮在请求期间防止重复提交」。
 * 必须放在 <form> 内部才能读到 useFormStatus 的 pending。
 */
export function SubmitButton({
  children,
  pendingText = "处理中…",
  className,
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
