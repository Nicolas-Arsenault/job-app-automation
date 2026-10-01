import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard is also opened through this machine's LAN address. Next.js
  // blocks cross-origin dev assets/HMR unless that hostname is explicitly
  // trusted; this setting is development-only and does not affect production.
  allowedDevOrigins: ["10.192.160.124", "172.20.10.10"],
  // pdf.js resolves its worker relative to the installed package. Bundling it
  // into a route chunk leaves that worker behind and breaks PDF parsing.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
