"use client";

/**
 * 全局错误边界：root layout 自身渲染失败时的最后防线。
 * 与 app/error.tsx 不同，这里必须自带 <html>/<body>，可用的样式只有内联与 Tailwind 类。
 */
export default function GlobalError({
  // error 的细节只在服务端日志；此处仅提供恢复入口
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <p style={{ fontWeight: 500 }}>应用暂时不可用</p>
          <p style={{ fontSize: 14, marginTop: 8, opacity: 0.8 }}>
            根布局渲染失败，可以尝试重新加载页面。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
