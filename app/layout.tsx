import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TaskFlow",
    template: "%s · TaskFlow",
  },
  description: "自然语言驱动的轻量任务协作平台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // data-theme 驱动深浅主题，取值见 app/globals.css 的 Layer 2 语义令牌。
  // 现阶段显式设为 "light"：组件尚未全部改用语义令牌，深色值提前生效会与仍是
  // 浅色写法的组件冲突（白底输入框、浅灰边框浮在深色画布上）。
  // 组件迁移完成后改为 "dark" —— 规范 ui-design-system-v2.md §3 定的是深色优先，
  // 届时只改这一个属性值，不需要动 CSS。
  return (
    <html
      lang="zh-CN"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
