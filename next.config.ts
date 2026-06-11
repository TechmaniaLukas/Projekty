import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next.js vkládá inline bootstrap/hydration skript; bez nonce nutné unsafe-inline.
  // vercel.live = Vercel Live feedback widget (jen na Vercel deploymentech).
  // Dev: React vyžaduje eval pro debugging (nikdy v produkci).
  `script-src 'self' 'unsafe-inline' https://vercel.live${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://vercel.live",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://vercel.live https://assets.vercel.com",
  // Convex realtime (https + websocket); Vercel Live používá Pusher.
  // Dev: lokální Convex backend na 127.0.0.1:3210 (http + ws).
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://vercel.live wss://*.pusher.com https://*.pusher.com${isDev ? " http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*" : ""}`,
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
