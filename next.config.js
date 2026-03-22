/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep @react-pdf/renderer server-side only — it uses Node.js APIs
  // (canvas, zlib, fs) that cannot be bundled for the browser.
  serverExternalPackages: ['@react-pdf/renderer'],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        canvas: false,
        zlib: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
