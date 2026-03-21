import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // xlsx is a server-only package; prevent it being bundled for the client
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

export default nextConfig;
