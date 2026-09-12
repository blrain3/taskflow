import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const textareaClassName =
  "block min-h-20 w-full resize-y rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-50";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(textareaClassName, className)} />;
}
