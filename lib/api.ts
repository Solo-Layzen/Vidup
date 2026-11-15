/**
 * Base URL de l'API de téléchargement.
 *
 * En local (ou sur un serveur Node), la valeur est vide : les appels partent
 * vers `/api/...` sur la même origine.
 *
 * Pour un déploiement statique (InfinityFree, Netlify, GitHub Pages…), on
 * renseigne `NEXT_PUBLIC_API_BASE` au moment du build avec l'URL du serveur
 * Node qui exécute yt-dlp/ffmpeg (Railway, Render, VPS…).
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim().replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${clean}` : clean;
}

export const HAS_REMOTE_API = API_BASE.length > 0;
