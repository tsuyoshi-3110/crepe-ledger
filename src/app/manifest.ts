import type { MetadataRoute } from "next";

/** ホーム画面に追加したときの名前と色 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "クレープ帳簿",
    short_name: "クレープ帳簿",
    description: "毎日の売上と仕入れのレシートから、粗利と営業利益を出します。",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#b5532b",
    lang: "ja",
  };
}
