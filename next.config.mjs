/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/student', destination: '/auth/login/student', permanent: false },
      { source: '/student/:path*', destination: '/auth/login/student', permanent: false },
    ];
  },
}

export default nextConfig
