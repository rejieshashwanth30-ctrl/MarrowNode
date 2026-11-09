/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.output = config.output || {};
    // Prevent ChunkLoadError timeouts on slower disk / cold compilations on Windows
    config.output.chunkLoadTimeout = 300000;
    return config;
  },
};

export default nextConfig;
