import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Recharts uses browser APIs — keep it client-side only
  transpilePackages: ["recharts"],
  // Allow images from any source
  images: { unoptimized: true },
};

export default nextConfig;
