import type { MetadataRoute } from "next";

/** ホーム画面に追加したときの名前と色 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "甘味処クレープよって屋 帳簿",
    short_name: "よって屋帳簿",
    description: "毎日の売上と仕入れのレシートから、粗利と営業利益を出します。",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#b5532b",
    lang: "ja",
    // お店のロゴの女の子がレジを打つ絵（2026-11-22）
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
