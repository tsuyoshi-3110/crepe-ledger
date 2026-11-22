import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "甘味処クレープよって屋 帳簿",
  description: "毎日の売上と仕入れのレシートから、粗利と営業利益を出します。",
  appleWebApp: { capable: true, title: "よって屋帳簿", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b5532b",
  // ホーム画面から開いた iPhone で、下のタブがホームに戻る横線と重ならないように env(safe-area-inset-bottom) を読む
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
