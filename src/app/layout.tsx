import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI同城行程规划 · MiniClaw",
  description: "AI驱动的全自动同城行程规划履约系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
