import type { MusicPlatform, MusicPlaylist, MusicTrack } from "./music";

const EMBED_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Récupère la page embed Spotify (track ou playlist) et extrait le `__NEXT_DATA__`.
 * C'est un endpoint public sans authentification qui expose le titre, les artistes,
 * la durée et les pochettes.
 */
async function fetchSpotifyEmbed(path: string): Promise<any> {
  const res = await fetch(`https://open.spotify.com/embed/${path}`, {
    headers: {
      "User-Agent": EMBED_UA,
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error("Spotify ne répond pas pour cette URL (statut " + res.status + ").");
  }
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) {
    throw new Error("Impossible d'analyser la page Spotify. Réessayez plus tard.");
  }
  try {
    return JSON.parse(m[1]);
  } catch {
    throw new Error("Réponse Spotify illisible. Réessayez plus tard.");
  }
}

function entityFromNextData(nextData: any): any {
  return nextData?.props?.pageProps?.state?.data?.entity ?? null;
}

function trackCover(entity: any): string {
  return (
    entity?.visualIdentity?.image?.[0]?.url ??
    entity?.coverArt?.sources?.[0]?.url ??
    ""
  );
}

/** Sérialise une entrée de trackList (playlist) ou une entité track isolée. */
function toTrack(raw: any): MusicTrack | null {
  const uriParts = (raw?.uri ?? "").toString().split(":");
  const id = uriParts[2] ?? raw?.id ?? "";
  const title = raw?.title ?? raw?.name ?? "";
  if (!id || !title) return null;
  const artists = raw?.subtitle ?? raw?.artists?.map((a: any) => a.name).join(", ") ?? "";
  const durationMs = raw?.duration ?? null;
  return {
    id,
    title,
    artist: artists,
    duration: durationMs ? Math.round(durationMs / 1000) : null,
    cover: trackCover(raw),
  };
}

/** Playlist Spotify → liste de titres (capée à MAX_MUSIC_TRACKS). */
export async function getSpotifyPlaylist(
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  const nextData = await fetchSpotifyEmbed(`playlist/${id}`);
  const entity = entityFromNextData(nextData);
  if (!entity) {
    throw new Error("Cette playlist Spotify est introuvable ou privée.");
  }
  const title = entity.title ?? entity.name ?? "Playlist Spotify";
  const cover = entity.coverArt?.sources?.[0]?.url ?? "";
  const rawTracks: any[] = Array.isArray(entity.trackList) ? entity.trackList : [];
  const tracks = rawTracks
    .map(toTrack)
    .filter((t): t is MusicTrack => t !== null)
    .slice(0, maxTracks);

  return { platform: "spotify", id, title, cover, count: tracks.length, tracks };
}

/** Titre Spotify seul (URL track) → une "playlist" d'un seul morceau. */
export async function getSpotifyTrack(
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  const nextData = await fetchSpotifyEmbed(`track/${id}`);
  const entity = entityFromNextData(nextData);
  const track = entity ? toTrack(entity) : null;
  if (!track) {
    throw new Error("Ce titre Spotify est introuvable ou indisponible.");
  }
  return {
    platform: "spotify",
    id,
    title: `${track.artist ? track.artist + " - " : ""}${track.title}`,
    cover: track.cover,
    count: 1,
    tracks: [track],
  };
}

export async function getSpotifyMusicPlaylist(
  kind: string,
  id: string,
  maxTracks: number
): Promise<MusicPlaylist> {
  if (kind === "track") return getSpotifyTrack(id, maxTracks);
  if (kind === "album" || kind === "playlist") return getSpotifyPlaylist(id, maxTracks);
  throw new Error("Seules les playlists, albums et titres Spotify sont pris en charge.");
}

export const SPOTIFY_PLATFORM: MusicPlatform = "spotify";