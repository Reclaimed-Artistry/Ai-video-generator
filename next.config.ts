import type { NextConfig } from "next";

/**
 * Files loaded by path at runtime (not via import) are invisible to Next's
 * output tracing, so serverless hosts like Vercel would ship functions
 * without them. List them explicitly for the routes that need them.
 */
const renderAssets = [
  "./node_modules/ffmpeg-static/ffmpeg",
  "./assets/fonts/**/*",
  "./node_modules/mespeak/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["mespeak", "ffmpeg-static"],
  outputFileTracingIncludes: {
    // Only the encoder route needs ffmpeg + fonts (~85 MB); keep other routes lean.
    "/api/projects/*/render": renderAssets,
    "/api/tts/**": ["./node_modules/mespeak/**/*"],
  },
  outputFileTracingExcludes: {
    "*": ["./storage/**/*", "./node_modules/ffprobe-static/**/*"],
  },
};

export default nextConfig;
