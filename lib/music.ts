import { findBestYouTubeMatch, streamYoutubeDownload } from "./youtube";
import { streamZip, type ZipFileProducer } from "./zip";
import { sanitizeFilename } from "./utils";

export type MusicPlatform = "spotify" | "deezer";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
  cover: string;
};

export type MusicPlaylist = {
  platform: MusicPlatform;
  id: string;
  title: string;
  cover: string;
  count: number;
  /** Nombre total de titres dans la source (si connu ; utile quand c'est > count). */
  total?: number;
  tracks: MusicTrack[];
};

/**
 * Nombre max de titres analysés / téléchargés en une fois.
 * Spotify n'expose que les ~100 premiers titres sans authentification,
 * Deezer étant paginé jusqu'à cette même limite.
 */
export const MAX_MUSIC_TRACKS = 100;

/** Construit la requête YouTube de recherche d'un titre. */
export function queryForTrack(track: MusicTrack): string {
  const parts = [track.artist, track.title].filter(Boolean);
  const base = parts.join(" - ") || "music";
  return `${base} official`;
}

// Cache mémoire : recherche YouTube résolue par titre (TTL 10 min).
const resolveCache = new Map<string, { time: number; url: string }>();
const RESOLVE_TTL_MS = 10 * 60 * 1000;

/** Résout (et met en cache) l'URL YouTube d'un titre, si trouvable. */
export async function resolveTrackUrl(
  track: MusicTrack
): Promise<{ url: string; title: string } | null> {
  const query = queryForTrack(track);
  const cached = resolveCache.get(query);
  if (cached && Date.now() - cached.time < RESOLVE_TTL_MS) {
    return { url: cached.url, title: track.title };
  }

  const match = await findBestYouTubeMatch(query, {
    durationSec: track.duration,
    trackTitle: track.title,
    artist: track.artist,
  });
  if (!match) return null;

  resolveCache.set(query, { time: Date.now(), url: match.url });
  if (resolveCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of resolveCache) {
      if (now - v.time > RESOLVE_TTL_MS) resolveCache.delete(k);
    }
  }
  return { url: match.url, title: match.title };
}

/** Nom de fichier MP3 stable pour un titre (artiste - titre). */
export function musicFileName(track: MusicTrack): string {
  const base = `${track.artist ? track.artist + " - " : ""}${track.title}`;
  return `${sanitizeFilename(base)}.mp3`;
}

/**
 * Télécharge UN titre (recherche YouTube → extraction MP3) et stream le fichier.
 * Le fichier temporaire est créé puis supprimé à la lecture, comme pour YouTube.
 */
export async function streamMusicTrackDownload(
  track: MusicTrack,
  mp3Quality: string
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; ext: string; size: number }> {
  const resolved = await resolveTrackUrl(track);
  if (!resolved) {
    throw new Error(
      `« ${track.artist ? track.artist + " - " : ""}${track.title} » introuvable sur YouTube.`
    );
  }
  return streamYoutubeDownload({
    url: resolved.url,
    audioOnly: true,
    mp3Quality,
  });
}

/**
 * Producteur asynchrone pour le ZIP musique : chaque titre est recherché
 * sur YouTube puis converti en MP3, streamé dans l'archive à la volée.
 */
export function musicTrackProducer(
  track: MusicTrack,
  mp3Quality: string
): ZipFileProducer {
  return async function* () {
    const resolved = await resolveTrackUrl(track);
    if (!resolved) {
      throw new Error("Titre introuvable sur YouTube.");
    }
    const { stream } = await streamYoutubeDownload({
      url: resolved.url,
      audioOnly: true,
      mp3Quality,
    });
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      // Annulation du téléchargement (client qui ferme l'onglet) → ferme le
      // flux et supprime le fichier temporaire.
      try {
        await reader.cancel();
      } catch {
        /* flux déjà terminé */
      }
      reader.releaseLock();
    }
  };
}

/** ZIP streamé des titres d'une playlist musique. */
export function streamMusicPlaylistZip(
  playlist: MusicPlaylist,
  mp3Quality: string
): { stream: ReadableStream<Uint8Array>; failures: string[] } {
  const failures: string[] = [];
  const usedNames = new Set<string>();
  const files = playlist.tracks.map((track) => {
    let name = musicFileName(track);
    if (usedNames.has(name)) {
      const stem = name.slice(0, -4);
      let i = 2;
      while (usedNames.has(`${stem} (${i}).mp3`)) i++;
      name = `${stem} (${i}).mp3`;
    }
    usedNames.add(name);
    return { name, produce: musicTrackProducer(track, mp3Quality) };
  });

  const { stream } = streamZip(files, {
    failureFileName: "_titres-indisponibles.txt",
    onError: (name, msg) => failures.push(`${name} : ${msg}`),
  });
  return { stream, failures };
}