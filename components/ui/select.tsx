import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 原生 <select> 的外观类。刻意与 `inputClassName` 共享同一套视觉（同高、同边框、同底色），
 * 但**单独声明而不复用 inputClassName**：`placeholder:` 前缀对 select 无意义，
 * disabled 态的 cursor 语义两者也不同；强行复用会让两条契约互相牵制。
 *
 * 焦点样式与全站契约一致（focus-visible 三件套）：此前依赖浏览器默认焦点环，
 * 环样式与组件层的 --focus-ring 环不一致，属已清掉的焦点差异之一。
 */
export const selectClassName =
  "block h-9 w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(selectClassName, className)} />;
}
