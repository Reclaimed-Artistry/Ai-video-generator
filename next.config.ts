import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "mespeak",
    "@andresaya/edge-tts",
    "@electric-sql/pglite",
  ],
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/projects/*/render": [
      "./node_modules/@ffmpeg-installer/ffmpeg/package.json",
      "./node_modules/@ffmpeg-installer/ffmpeg/index.js",
      "./node_modules/@ffmpeg-installer/linux-x64/**/*",
      "./src/assets/fonts/**/*",
      "./node_modules/mespeak/src/**/*",
      "./node_modules/mespeak/voices/en/**/*",
    ],
    "/api/tts/preview": [
      "./node_modules/mespeak/src/**/*",
      "./node_modules/mespeak/voices/en/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "./storage/**/*",
      "./.pglite/**/*",
      "./node_modules/ffprobe-static/**/*",
      "./.git/**/*",
      "./scripts/**/*",
    ],
  },
};

export default nextConfig;
