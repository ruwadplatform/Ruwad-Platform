import type { NextConfig } from "next";

/** Where `/api/*` is forwarded to (the Nest backend).
 *
 * The browser talks to the backend through THIS site (`/api/...`, same origin) instead of calling
 * the Render domain directly. That makes the login cookie a first-party cookie, so it is not
 * dropped by browsers that block third-party cookies (Edge/Safari/Chrome private windows), which
 * is what made sign-in look like it "did nothing" on the Vercel deployment.
 *
 * Resolution order: BACKEND_URL, then an absolute NEXT_PUBLIC_API_URL (the value already set on
 * Vercel, e.g. https://…onrender.com/api), then the production default / local backend. */
function backendOrigin(): string {
  const configured = process.env.BACKEND_URL ?? (/^https?:\/\//.test(process.env.NEXT_PUBLIC_API_URL ?? "") ? process.env.NEXT_PUBLIC_API_URL : undefined);
  if (configured) return configured.replace(/\/+$/, "").replace(/\/api$/, "");
  return process.env.NODE_ENV === "production" ? "https://ruwad-backend-e92x.onrender.com" : "http://localhost:4000";
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendOrigin()}/api/:path*` }];
  },
};

export default nextConfig;
