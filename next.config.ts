import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "mespeak", "@andresaya/edge-tts"],
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/projects/*/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/index.js",
      "./node_modules/ffmpeg-static/package.json",
      "./src/assets/fonts/**/*",
      "./src/assets/music/**/*",
      "./node_modules/mespeak/src/**/*",
      "./node_modules/mespeak/voices/en/**/*",
    ],
    "/api/music/*": ["./src/assets/music/**/*"],
    "/api/tts/preview": [
      "./node_modules/mespeak/src/**/*",
      "./node_modules/mespeak/voices/en/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "./storage/**/*",
      "./node_modules/ffprobe-static/**/*",
      "./.git/**/*",
      "./scripts/**/*",
    ],
  },
};

export default nextConfig;
