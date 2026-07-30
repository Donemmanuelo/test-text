/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Proxy API requests in development to avoid CORS
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/backend/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
          },
        ]
      : [];
  },
};

module.exports = nextConfig;
