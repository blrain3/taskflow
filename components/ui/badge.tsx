import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 徽标。两个变体的差别只在「有没有边框」：
 *
 * - `default`：中性徽标，细边框 + 弱化文字，用于序号、计数等无状态语义的场景。
 * - `status`：状态徽标，无边框 + 字重提升。**颜色不由这里决定**——调用方把
 *   `ISSUE_STATUS_STYLES[status]` 通过 className 传进来，配色真源仍留在 `types/issue.ts`。
 *
 * `status` 变体完全不带 border：状态色本身是带底色的实心块，加边框会让 4 个状态色出现
 * 粗细不一的描边，且比现状多 1px 尺寸。保持无边框可与迁移前的手写徽标像素一致。
 */
const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs", {
  variants: {
    variant: {
      default: "border border-line text-fg-muted",
      status: "font-medium",
    },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return <span {...props} className={cn(badgeVariants({ variant }), className)} />;
}

export { badgeVariants };
