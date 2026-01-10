import type { NextConfig } from "next";

/**
 * Next.js configuration for Paigent Studio.
 *
 * @description Configures the Next.js application with:
 * - Server external packages for MongoDB driver compatibility
 * - Vercel Cron headers allowlist for secure cron job execution
 * - Experimental features for improved performance
 */
const nextConfig: NextConfig = {
  /**
   * Server external packages that should not be bundled.
   * MongoDB driver requires native Node.js modules.
   */
  serverExternalPackages: ["mongodb"],

  /**
   * Experimental features configuration.
   */
  experimental: {
    /**
     * Enable server actions for form handling and mutations.
     */
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  /**
   * Turbopack configuration.
   *
   * @description Next.js 16+ uses Turbopack by default. This empty config
   * acknowledges that the webpack config below may not be needed under Turbopack,
   * as Turbopack automatically handles client-side exclusion of Node.js built-in
   * modules (dns, net, tls, fs) without explicit fallback configuration.
   */
  turbopack: {},

  /**
   * Headers configuration for API routes.
   */
  async headers() {
    return [
      {
        /**
         * SSE endpoints need specific headers for streaming.
         */
        source: "/api/runs/:runId/events",
        headers: [
          { key: "Content-Type", value: "text/event-stream" },
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "Connection", value: "keep-alive" },
        ],
      },
    ];
  },

  /**
   * Webpack configuration for edge compatibility.
   */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle these modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
