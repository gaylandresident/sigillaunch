/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@rainbow-me/rainbowkit"],
  webpack: (config) => {
    // Stub Coinbase CDP SDK's broken @x402/* transitive imports (pulled in by
    // wagmi 2.14's baseAccount connector). We don't use Coinbase base pay flows.
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "@x402/evm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};
module.exports = nextConfig;
