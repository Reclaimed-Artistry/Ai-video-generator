import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mespeak", "ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
