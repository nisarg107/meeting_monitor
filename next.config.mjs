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
  // Disable custom server for Vercel deployment
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
  },
};

export default nextConfig;
