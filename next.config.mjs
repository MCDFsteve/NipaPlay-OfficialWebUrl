import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(process.cwd())
  }
};

export default nextConfig;
