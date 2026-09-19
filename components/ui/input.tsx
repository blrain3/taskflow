import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const inputClassName =
  "block h-9 w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClassName, className)} />;
}
