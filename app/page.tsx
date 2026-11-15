import DownloadForm from "@/components/DownloadForm";
import Faq from "@/components/Faq";

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
          Téléchargez vos vidéos et vos{" "}
          <span className="text-brand">playlists</span>{" "}
          <span className="text-gray-400">·</span>{" "}
          <span className="text-gray-900">YouTube</span>{" "}
          <span className="text-gray-400">·</span>{" "}
          <span className="text-gray-900">TikTok</span>{" "}
          <span className="text-gray-400">·</span>{" "}
          <span className="text-gray-900">Spotify</span>{" "}
          <span className="text-gray-400">·</span>{" "}
          <span className="text-gray-900">Deezer</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 sm:text-lg">
          Vidéos <strong>sans filigrane</strong> pour TikTok, playlists YouTube en ZIP,
          et playlists <strong>Spotify / Deezer</strong> en MP3. Jusqu'à la{" "}
          <strong>8K</strong>, 60 fps et HDR quand la source le permet. Sans limite
          et sans inscription.
        </p>
      </section>

      <section className="mt-10">
        <DownloadForm />
      </section>

      <section className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        <Feature
          icon="🎬"
          title="Multi-plateformes"
          text="YouTube, TikTok, Spotify et Deezer détectés automatiquement grâce à la validation d'URL."
        />
        <Feature
          icon="🚫"
          title="Sans filigrane"
          text="Les vidéos TikTok sont récupérées sans watermark grâce à l'API interne."
        />
        <Feature
          icon="🎵"
          title="Playlists MP3"
          text="Spotify et Deezer en MP3 320 kbit/s, titre par titre ou toute la playlist en un ZIP."
        />
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-2xl font-bold">Questions fréquentes</h2>
        <p className="mt-2 text-sm text-gray-500">
          Une playlist qui ne se télécharge pas ? Vérifiez d'abord qu'elle est
          publique.
        </p>
        <div className="mt-5">
          <Faq limit={4} />
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card text-center">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{text}</p>
    </div>
  );
}
