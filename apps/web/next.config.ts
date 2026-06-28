import type { NextConfig } from "next";

const s3Hosts = (process.env.NEXT_PUBLIC_S3_PUBLIC_HOST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "";
let apiHost: string | null = null;
try {
  apiHost = apiUrl ? new URL(apiUrl).hostname : null;
} catch {
  apiHost = null;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output is what we need for a slim Docker image on Hostinger
  // VPS (~50MB vs 200MB). `next start` continues to work locally.
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  images: {
    remotePatterns: [
      // Allow signed S3 / MinIO URLs the backend hands out.
      ...(s3Hosts.length
        ? s3Hosts.map((hostname) => ({
            protocol: "https" as const,
            hostname,
          }))
        : []),
      ...(apiHost ? [{ protocol: "https" as const, hostname: apiHost }] : []),
      // Allow any HTTPS host as a safety net; signed URLs change often.
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
