import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const uiSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const editorialSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
});

const techMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-tech",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reclaimed Artistry — Prompt-to-Picture Assembly & H.264 Master Desk",
  description:
    "Write a brief, edit the scene rundown, record neural voiceover, pull licensed B-roll from Pexels & Pixabay, and export H.264 MP4s at 240p, 360p, or 1080p.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${uiSans.variable} ${editorialSerif.variable} ${techMono.variable}`}
    >
      <body className="min-h-screen bg-canvas text-paper antialiased">
        {children}
      </body>
    </html>
  );
}
