/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
