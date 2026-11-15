/**
 * Qualités disponibles pour tous les utilisateurs.
 * Le service est entièrement gratuit : plus de palier Premium ni de quota.
 */

/** Hauteur vidéo maximale proposée (8K). Au-delà, on retombe sur le meilleur flux dispo. */
export const MAX_VIDEO_HEIGHT = 4320;

/** Qualité MP3 par défaut (musique Spotify/Deezer) : 320 kbit/s constants. */
export const MP3_QUALITY = "320K";

/** Débit audio MP3 annoncé dans l'interface (kbit/s). */
export const MP3_BITRATE = 320;

/**
 * Débits MP3 proposés pour l'extraction audio d'une vidéo YouTube.
 * yt-dlp accepte « 320K », « 256K », etc. pour un MP3 à débit constant.
 */
export const AUDIO_QUALITIES = [
  { value: "320K", bitrate: 320, label: "320 kbit/s" },
  { value: "256K", bitrate: 256, label: "256 kbit/s" },
  { value: "192K", bitrate: 192, label: "192 kbit/s" },
  { value: "128K", bitrate: 128, label: "128 kbit/s" },
] as const;

export type AudioQuality = (typeof AUDIO_QUALITIES)[number]["value"];

export function isAudioQuality(value: unknown): value is AudioQuality {
  return AUDIO_QUALITIES.some((q) => q.value === value);
}
