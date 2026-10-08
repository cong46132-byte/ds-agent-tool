import type { NextConfig } from "next";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.2.138"],
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiTarget}/api/v1/:path*` }];
  },
};

export default nextConfig;
