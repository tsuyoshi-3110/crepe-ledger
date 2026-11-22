import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // スマホから同じ Wi-Fi の Mac の開発サーバーを開くための許可（192.168.x.x:3000 か 〇〇.local:3000）
  allowedDevOrigins: ["192.168.*.*", "*.local"],
};

export default nextConfig;
