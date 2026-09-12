import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";

/** 全站 404：自定义边界替代 Next 默认页，保持与产品一致的视觉与可回退路径。 */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-fg-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">页面不存在</h1>
        <p className="mt-2 text-sm text-fg-muted">地址可能已失效，或者你访问的资源已被删除。</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link className={buttonClassName("primary")} href="/issues">
            返回任务列表
          </Link>
          <Link className={buttonClassName("ghost")} href="/">
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
}
