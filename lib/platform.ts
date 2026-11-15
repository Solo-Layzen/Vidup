export const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export const YOUTUBE_PLAYLIST_REGEX = /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/;

export const TIKTOK_REGEX =
  /(?:tiktok\.com\/@[\w.-]+\/video\/(\d+))|(?:tiktok\.com\/t\/([a-zA-Z0-9_-]+))|(?:vt\.tiktok\.com\/[a-zA-Z0-9_-]+)/i;

// open.spotify.com (optionnellement localisé intl-xx) ou spotify.link.
export const SPOTIFY_REGEX =
  /(?:open\.|www\.)?spotify\.com\/(?:(?:[a-z]{2}(?:-[a-z]{2})?|intl-[a-z]{2,})\/)?(track|album|playlist|artist)\/([a-zA-Z0-9]+)/i;
export const SPOTIFY_PLAYLIST_REGEX = /spotify\.com\/(?:[a-z]{2}(?:-[a-z]{2})?|intl-[a-z]{2,}\/)?playlist\/([a-zA-Z0-9]+)/i;
export const SPOTIFY_LINK_REGEX = /spotify\.link\/[a-zA-Z0-9]+/i;

// www.deezer.com (optionnellement localisé /fr/…, sous-domaines) ou liens courts
// link.deezer.com/s/…, deezer.page.link, deezer.onelink.me, deezer.link.
export const DEEZER_REGEX =
  /(?:[\w-]+\.)*deezer\.com\/(?:[a-z]{2,}(?:-[a-z]{2,})?\/)?(track|album|playlist|artist)\/(\d+)/i;
export const DEEZER_SHORT_LINK_REGEX =
  /(?:(?:link|www)\.deezer\.com\/s\/|deezer\.page\.link\/|deezer\.onelink\.me\/|deezer\.link\/)[^\s"'<>]+/i;
export const DEEZER_PLAYLIST_REGEX =
  /(?:[\w-]+\.)*deezer\.com\/(?:[a-z]{2,}(?:-[a-z]{2,})?\/)?playlist\/(\d+)/i;

export type MusicPlatform = "spotify" | "deezer";

export type Platform = "youtube" | "tiktok" | MusicPlatform | "unknown";

export function detectPlatform(url: string): Platform {
  if (YOUTUBE_REGEX.test(url) || YOUTUBE_PLAYLIST_REGEX.test(url)) return "youtube";
  if (TIKTOK_REGEX.test(url)) return "tiktok";
  if (SPOTIFY_REGEX.test(url) || SPOTIFY_LINK_REGEX.test(url)) return "spotify";
  if (DEEZER_REGEX.test(url) || DEEZER_SHORT_LINK_REGEX.test(url)) return "deezer";
  return "unknown";
}

export function isYoutubePlaylist(url: string): boolean {
  return YOUTUBE_PLAYLIST_REGEX.test(url);
}

export function getYouTubeVideoId(url: string): string | null {
  const m = url.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
}

export function getTikTokVideoId(url: string): string | null {
  const m = url.match(TIKTOK_REGEX);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/** Retourne le type d'entité Spotify (track/album/playlist/artist) et son id. */
export function getSpotifyEntity(url: string): { kind: string; id: string } | null {
  const m = url.match(SPOTIFY_REGEX);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

/** Retourne le type d'entité Deezer (track/album/playlist/artist) et son id. */
export function getDeezerEntity(url: string): { kind: string; id: string } | null {
  const m = url.match(DEEZER_REGEX);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

export function isMusicUrl(url: string): boolean {
  return (
    SPOTIFY_REGEX.test(url) ||
    SPOTIFY_LINK_REGEX.test(url) ||
    DEEZER_REGEX.test(url) ||
    DEEZER_SHORT_LINK_REGEX.test(url)
  );
}

const FIRST_URL_REGEX = /https?:\/\/[^\s<>"']+/i;

/**
 * Extrait la première URL d'un texte collé (ex. message de partage Deezer du
 * type « Écoutez … sur Deezer : https://link.deezer.com/s/… »).
 * Retire aussi la ponctuation finale parasite.
 */
export function extractUrl(input: string): string {
  const match = input.match(FIRST_URL_REGEX);
  const value = (match ? match[0] : input).trim();
  return value.replace(/[)\].,;!]+$/, "");
}

/**
 * Résout les liens courts (deezer.page.link, link.deezer.com, spotify.link)
 * vers leur URL cible. Retourne l'URL d'origine si elle n'est pas concernée.
 */
export async function resolveMusicRedirectUrl(url: string): Promise<string> {
  const clean = extractUrl(url);
  if (!SPOTIFY_LINK_REGEX.test(clean) && !DEEZER_SHORT_LINK_REGEX.test(clean)) return clean;
  try {
    const res = await fetch(clean, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(20_000),
    });

    if (getSpotifyEntity(res.url) || getDeezerEntity(res.url)) return res.url;

    // Certains liens courts (Firebase Dynamic Links) répondent en HTML avec la
    // destination dans le corps plutôt qu'en redirection HTTP.
    const body = await res.text();
    let decoded = body;
    try {
      decoded = decodeURIComponent(body);
    } catch {
      /* corps non encodé */
    }
    const target = decoded.match(
      /https?:\/\/(?:www\.)?(?:deezer|spotify)\.com\/[^\s"'<>\\]+/i
    );
    if (target) return target[0];

    return res.url || clean;
  } catch {
    return clean;
  }
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//, "");
}