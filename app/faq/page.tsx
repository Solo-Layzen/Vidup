import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/Faq";

export const metadata: Metadata = {
  title: "FAQ — VidUp",
  description:
    "Réponses aux questions fréquentes : playlist Spotify/Deezer publique, ZIP cassé, qualité 4K/8K, MP3 320, hébergement InfinityFree…",
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
        Questions <span className="text-brand">fréquentes</span>
      </h1>
      <p className="mt-3 text-gray-600">
        Playlist qui ne se télécharge pas, archive ZIP, 4K/8K, MP3 320 kbit/s,
        hébergement… Voici l'essentiel.
      </p>

      <div className="mt-8">
        <Faq />
      </div>

      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
        <p className="font-semibold">Astuce playlist</p>
        <p className="mt-1">
          Si le téléchargement d'une playlist Spotify ou Deezer échoue, ouvrez son lien
          dans une fenêtre de navigation privée. Si une connexion est demandée, la
          playlist n'est pas publique : passez-la en public, puis recollez l'URL
          complète.
        </p>
      </div>

      <p className="mt-8 text-center">
        <Link href="/" className="font-semibold text-brand hover:underline">
          ← Retour au téléchargeur
        </Link>
      </p>
    </div>
  );
}
