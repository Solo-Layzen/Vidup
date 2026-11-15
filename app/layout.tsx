import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "VidUp — Téléchargeur YouTube, TikTok, Spotify & Deezer",
  description:
    "Téléchargez vos vidéos YouTube et TikTok (sans filigrane) ainsi que vos playlists Spotify et Deezer en MP3, gratuitement et sans limite.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
