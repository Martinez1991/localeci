/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The proxy routes call node:crypto — keep them on the Node.js runtime.
    serverComponentsExternalPackages: ["@localeci/core", "@localeci/providers"],
  },
};

export default nextConfig;
