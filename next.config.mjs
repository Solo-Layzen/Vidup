/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  // Export statique (dossier `out/`) pour un hébergement PHP/statique type
  // InfinityFree : l'interface est servie en HTML/JS, l'API reste sur un
  // serveur Node (voir README « Déploiement InfinityFree »).
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
