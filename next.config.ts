import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), browsing-topics=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  },
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    proxyClientMaxBodySize: "6mb",
    serverActions: {
      bodySizeLimit: "64kb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
