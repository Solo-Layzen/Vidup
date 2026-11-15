import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-start justify-between gap-4 text-sm text-gray-500 sm:flex-row sm:items-center">
          <span className="font-semibold text-gray-700">VidUp — 100 % gratuit, sans limite</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-brand">
              Téléchargeur
            </Link>
            <Link href="/faq/" className="hover:text-brand">
              FAQ
            </Link>
            <span>© {new Date().getFullYear()} VidUp</span>
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          ⚠️ Avertissement légal : VidUp est destiné exclusivement au téléchargement de
          contenus dont vous détenez les droits d'auteur ou qui sont libres de droits
          (contenus du domaine public, sous licence ouverte, ou créés par vous-même).
          Le téléchargement de vidéos protégées sans autorisation peut enfreindre les
          conditions d'utilisation des plateformes et la législation applicable. Vous
          êtes seul responsable de l'usage que vous faites de ce service.
        </p>
      </div>
    </footer>
  );
}
