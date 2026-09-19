"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 应用外壳的跨页导航。
 *
 * 用 usePathname 而不是给每个页面传参：导航属于外壳，页面不该为了高亮它而多接一个 prop。
 * aria-current="page" 让屏幕阅读器也能知道当前位置——高亮不能只靠颜色承载语义。
 */
const LINKS = [
  { href: "/issues", label: "任务" },
  { href: "/documents", label: "文档" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active ? "bg-hover font-medium text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
