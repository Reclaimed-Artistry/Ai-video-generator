import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reclaimed Artistry — AI video studio",
  description:
    "Type what you want and get a finished, narrated video. InVideo-style prompt-to-video with templates, brand kits, AI imagery, voice cloning and multi-language dubbing.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-thin">
      <body className="min-h-screen bg-canvas text-paper antialiased">{children}</body>
    </html>
  );
}
