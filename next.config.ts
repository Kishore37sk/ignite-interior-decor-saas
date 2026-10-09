import type { NextConfig } from "next";

const supabaseUrl = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
})();
const supabaseHost = supabaseUrl?.hostname ?? null;
const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Next.js injects inline bootstrap/RSC scripts without a nonce,
 * so script-src needs 'unsafe-inline' (dev also needs 'unsafe-eval' for fast refresh);
 * the policy still blocks third-party scripts, plugins, framing, foreign form targets and
 * — via connect-src — any network call except this app and the Supabase project (REST,
 * Auth, Storage over https plus Realtime over wss). Images: the company logo may be any
 * https URL (Settings → Company), so img-src allows https: but never http: or javascript:.
 */
const contentSecurityPolicy = (() => {
  const supabaseOrigin = supabaseUrl?.origin ?? "";
  const supabaseWs = supabaseUrl ? supabaseOrigin.replace(/^http/, "ws") : "";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...(supabaseOrigin.startsWith("http:") ? [supabaseOrigin] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabaseOrigin, supabaseWs, ...(isDev ? ["ws:"] : [])].filter(Boolean),
    "media-src": ["'self'", "blob:", ...(supabaseOrigin ? [supabaseOrigin] : [])],
    "frame-src": ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
})();

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
      : [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
