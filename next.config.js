/** @type {import('next').NextConfig} */
const nextConfig = {
  // xlsx is a server-only package; prevent it from being bundled for the client
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
