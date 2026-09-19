import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // 焦点契约（全站唯一）：focus-visible 三件套 = 2px --focus-ring + 2px offset。
  // 刻意不写常驻 outline-none/hidden：它们会把 --tw-outline-style 污染成 none，
  // 反杀 focus-visible:outline-2（变量读回 none）；且 UA 默认 outline 本就只在
  // 键盘焦点出现，无需常驻隐藏。深浅主题都由 --focus-ring 令牌驱动。
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-brand text-fg-inverse hover:bg-brand-hover",
        secondary: "border border-line-strong bg-raised text-fg hover:bg-hover",
        ghost: "text-fg-muted hover:bg-hover hover:text-fg",
        danger: "bg-danger text-fg-inverse hover:opacity-90",
      },
      size: { sm: "h-8 px-3", md: "h-9", lg: "h-10 px-5", icon: "h-9 w-9 px-0" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function buttonClassName(variant: ButtonProps["variant"] = "primary", className = "") {
  return cn(buttonVariants({ variant }), className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button {...props} className={cn(buttonVariants({ variant, size }), className)} />;
}

export { buttonVariants };
