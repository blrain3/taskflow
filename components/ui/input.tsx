import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const inputClassName =
  "block h-9 w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClassName, className)} />;
}
