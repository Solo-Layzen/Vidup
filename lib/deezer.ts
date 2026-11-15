import type { MusicPlatform, MusicPlaylist, MusicTrack } from "./music";

const API_BASE = "https://api.deezer.com";

const API_UA = "VidUp/1.0 (+https://vidup.local)";

/**
 * Deezer (Akamai) bloque certaines connexions : VPN/Cloudflare WARP, IP de
 * datacenter, etc. On bascule alors sur un lecteur-proxy public qui relaie le
 * JSON de l'API. Uniquement des métadonnées publiques transitent.
 * Personnalisable/désactivable via DEEZER_PROXY ("off" pour désactiver).
 */
const PROXY_BASE = (() => {
  const configured = process.env.DEEZER_PROXY?.trim();
  if (configured === "off") return null;
  return configured || "https://r.jina.ai/";
})();

async function fetchJsonDirect(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": API_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error("Deezer a renvoyé le statut " + res.status + ".");
  }
  return res.json();
}

function parseProxyPayload(text: string): any {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    // Certains proxys encapsulent le JSON dans un objet { data: { content } }.
    if (parsed?.data && typeof parsed.data.content === "string") {
      return JSON.parse(parsed.data.content);
    }
    return parsed;
  } catch {
    // Dernier recours : extraire le premier objet JSON du texte.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Réponse du proxy Deezer illisible.");
  }
}

async function fetchJsonViaProxy(url: string): Promise<any> {
  if (!PROXY_BASE) throw new Error("Aucun proxy Deezer configuré.");
  const res = await fetch(PROXY_BASE + url, {
    headers: { "X-Return-Format": "text" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error("Le proxy Deezer a renvoyé le statut " + res.status + ".");
  }
  const text = await res.text();
  return parseProxyPayload(text);
}

async function getJson(url: string): Promise<any> {
  let data: any;
  try {
    data = await fetchJsonDirect(url);
  } catch (directError) {
    try {
      data = await fetchJsonViaProxy(url);
    } catch (proxyError) {
      throw new Error(
        "Deezer est inaccessible depuis ce réseau (" +
          (directError as Error).message +
          "). Si vous utilisez un VPN ou Cloudflare WARP, désactivez-le pour Deezer, ou utilisez Spotify. " +
          "Détail proxy : " +
          (proxyError as Error).message
      );
    }
  }

  if (!data || data.error) {
    const msg = data?.error?.message ?? "";
    throw new Error(
      msg || "Deezer ne permet pas de récupérer ce contenu. Vérifiez que la playlist est publique."
    );
  }
  return data;
}

function toTrack(raw: any): MusicTrack | null {
  const id = raw?.id;
  const title = raw?.title;
  if (!id || !title) return null;
  const artist =
    (raw?.artist?.name ?? raw?.contributors?.[0]?.name ?? raw?.artist_name ?? "").toString();
  return {
    id: String(id),
    title,
    artist,
    duration: raw?.duration ?? null,
    cover: raw?.album?.cover_medium ?? raw?.cover_medium ?? "",
  };
}

/** Collection Deezer (playlist ou album) via l'API publique, paginée. */
async function getDeezerCollection(
  kind: "playlist" | "album",
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  const data = await getJson(`${API_BASE}/${kind}/${id}`);
  const title = data.title ?? (kind === "album" ? "Album Deezer" : "Playlist Deezer");
  const cover = data.picture_medium ?? data.cover_medium ?? data.picture ?? "";
  const tracks: MusicTrack[] = [];
  let total = Number(data.nb_tracks) || 0;

  // Deezer accepte jusqu'à 100 titres par page : une seule requête pour une
  // playlist courante (moins d'appels, donc moins de risque de rate limit).
  let nextUrl: string | null = `${API_BASE}/${kind}/${id}/tracks?limit=100`;
  while (nextUrl && tracks.length < maxTracks) {
    const page = await getJson(nextUrl);
    const rawTracks: any[] = Array.isArray(page?.data) ? page.data : [];
    if (page?.total && page.total > total) total = Number(page.total);
    for (const raw of rawTracks) {
      const t = toTrack(raw);
      if (t) tracks.push(t);
      if (tracks.length >= maxTracks) break;
    }
    const next: string | null = page?.next ?? null;
    if (!next) break;
    nextUrl = /^https?:\/\//.test(next) ? next : `${API_BASE}${next}`;
  }

  return {
    platform: "deezer",
    id,
    title,
    cover,
    count: tracks.length,
    total: total > tracks.length ? total : undefined,
    tracks: tracks.slice(0, maxTracks),
  };
}

/** Playlist Deezer via l'API publique (pagination jusqu'à `maxTracks`). */
export async function getDeezerPlaylist(
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  return getDeezerCollection("playlist", id, maxTracks);
}

/** Album Deezer (pistes incluses) via l'API publique. */
export async function getDeezerAlbum(
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  return getDeezerCollection("album", id, maxTracks);
}

/** Titre Deezer seul → une "playlist" d'un seul morceau. */
export async function getDeezerTrack(
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  const data = await getJson(`${API_BASE}/track/${id}`);
  const track = toTrack(data);
  if (!track) {
    throw new Error("Ce titre Deezer est introuvable ou indisponible.");
  }
  return {
    platform: "deezer",
    id,
    title: `${track.artist ? track.artist + " - " : ""}${track.title}`,
    cover: track.cover,
    count: 1,
    tracks: [track],
  };
}

export async function getDeezerMusicPlaylist(
  kind: string,
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  if (kind === "track") return getDeezerTrack(id, maxTracks);
  if (kind === "album") return getDeezerAlbum(id, maxTracks);
  if (kind === "playlist") return getDeezerPlaylist(id, maxTracks);
  throw new Error("Seules les playlists, albums et titres Deezer sont pris en charge.");
}

export const DEEZER_PLATFORM: MusicPlatform = "deezer";
