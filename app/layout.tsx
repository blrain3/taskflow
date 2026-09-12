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
  // 组件已统一使用语义令牌，按规范启用深色优先主题。
  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
