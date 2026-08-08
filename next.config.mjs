/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Cloudflare's Workers runtime does not support the default Next.js
  // image optimizer (it depends on Node APIs / sharp). We serve images
  // as-is and handle resizing client-side or via R2 + a custom loader
  // added in the file-uploads step.
  images: {
    unoptimized: true,
  },

  // Fail the build on type errors and lint errors — no silently broken
  // deploys.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Route handlers under src/app/api/** declare `export const runtime =
  // "edge"` individually (added as each route is built). This flag just
  // ensures trailing slashes are consistent between the Next dev server
  // and the Pages-deployed build.
  trailingSlash: false,
};

// Enables Cloudflare bindings (D1, KV, R2, Durable Object stubs) to be
// available on `process.env`/`getRequestContext().env` when running
// `next dev` locally, mirroring the production Pages runtime. This is a
// no-op during `next build` and in production.
if (process.env.NODE_ENV === 'development') {
  const { setupDevPlatform } = await import('@cloudflare/next-on-pages/next-dev');
  await setupDevPlatform();
}

export default nextConfig;
