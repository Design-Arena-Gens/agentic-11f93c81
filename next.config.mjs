/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["xlsx", "mustache", "resend"]
  }
};

export default nextConfig;
