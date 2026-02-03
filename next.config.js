/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['parquetjs'],
  },
};

module.exports = nextConfig;
