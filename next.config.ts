import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  // Next.js vkládá inline bootstrap/hydration skript; bez nonce nutné unsafe-inline.
  // vercel.live = Vercel Live feedback widget (jen na Vercel deploymentech).
  "script-src 'self' 'unsafe-inline' https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://vercel.live",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://vercel.live https://assets.vercel.com",
  // Convex realtime (https + websocket); Vercel Live používá Pusher.
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://vercel.live wss://*.pusher.com https://*.pusher.com",
  "frame-src 'self' https://vercel.live",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
