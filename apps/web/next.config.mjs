/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true, // stable in Next 15 (previously experimental.typedRoutes)

  /**
   * In dev we proxy /api/* to the NestJS server on :3000 so the browser sees
   * a same-origin call (no CORS preflight) and the API URL is stable in the
   * client code regardless of deploy target. Prod deployment will route
   * /api/* at the edge/ingress layer — this rewrite is a dev convenience.
   */
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
