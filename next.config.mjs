/** @type {import('next').NextConfig} */
const nextConfig = {
  // Temporarily disable images to isolate the issue
  // images: {
  //   remotePatterns: [
  //     {
  //       protocol: 'https',
  //       hostname: 'img.clerk.com',
  //     },
  //   ],
  // },
  experimental: {
    instrumentationHook: false,
  },
};

export default nextConfig;
