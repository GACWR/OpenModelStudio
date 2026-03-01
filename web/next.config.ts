import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Proxy workspace URLs to JupyterHub service
      {
        source: "/workspace/:path*",
        destination: "http://localhost:31003/:path*",
      },
      // Proxy API calls
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
