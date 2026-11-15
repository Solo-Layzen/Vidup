import type { NextRequest } from "next/server";
import { z } from "zod";
import type { MusicPlatform, MusicPlaylist } from "./music";
import { MAX_MUSIC_TRACKS, streamMusicPlaylistZip, streamMusicTrackDownload } from "./music";
import { getDeezerMusicPlaylist } from "./deezer";
import { getSpotifyMusicPlaylist } from "./spotify";
import {
  DEEZER_SHORT_LINK_REGEX,
  SPOTIFY_LINK_REGEX,
  getDeezerEntity,
  getSpotifyEntity,
  resolveMusicRedirectUrl,
} from "./platform";
import { checkRateLimit } from "./rate-limit";
import { MP3_QUALITY } from "./quality";
import { errorResponse, sanitizeFilename } from "./utils";

const InfoSchema = z.object({ action: z.literal("info"), url: z.string().min(1) });
const TrackSchema = z.object({
  action: z.literal("track"),
  url: z.string().min(1),
  trackId: z.string().min(1),
});
const PlaylistSchema = z.object({
  action: z.literal("playlist"),
  url: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_MUSIC_TRACKS).optional(),
});

type Kind = "playlist" | "album" | "track" | "artist";

async function fetchPlaylistForUrl(
  platform: MusicPlatform,
  rawUrl: string
): Promise<{ kind: Kind; playlist: MusicPlaylist }> {
  const url = await resolveMusicRedirectUrl(rawUrl);
  if (platform === "spotify") {
    const entity = getSpotifyEntity(url);
    if (!entity) {
      if (SPOTIFY_LINK_REGEX.test(url)) {
        throw new Error(
          "Le lien court Spotify n'a pas pu être résolu. Ouvrez-le dans un navigateur puis collez l'URL complète open.spotify.com/… (désactivez aussi VPN/WARP)."
        );
      }
      throw new Error("URL Spotify invalide.");
    }
    const playlist = await getSpotifyMusicPlaylist(entity.kind, entity.id, MAX_MUSIC_TRACKS);
    return { kind: entity.kind as Kind, playlist };
  }
  const entity = getDeezerEntity(url);
  if (!entity) {
    if (DEEZER_SHORT_LINK_REGEX.test(url)) {
      throw new Error(
        "Le lien court Deezer n'a pas pu être résolu. Ouvrez-le dans un navigateur puis collez l'URL complète deezer.com/track/… (désactivez aussi VPN/WARP)."
      );
    }
    throw new Error("URL Deezer invalide.");
  }
  const playlist = await getDeezerMusicPlaylist(entity.kind, entity.id, MAX_MUSIC_TRACKS);
  return { kind: entity.kind as Kind, playlist };
}

/**
 * Handler commun aux plateformes Spotify et Deezer.
 * - info     : liste les titres de la playlist/album (ou d'un single).
 * - track    : télécharge UN titre en MP3.
 * - playlist : ZIP complet des titres.
 */
export async function handleMusicRoute(req: NextRequest, platform: MusicPlatform) {
  const rl = checkRateLimit(req);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Corps de requête invalide.", 400);
  }

  // ── Action : informations (listes des titres) ──
  const infoParse = InfoSchema.safeParse(body);
  if (infoParse.success) {
    const { url } = infoParse.data;
    try {
      const { playlist } = await fetchPlaylistForUrl(platform, url);
      return Response.json({ ok: true, platform, playlist });
    } catch (e) {
      return errorResponse((e as Error).message, 502, "MUSIC_FETCH_FAILED");
    }
  }

  // ── Action : téléchargement d'un seul titre ──
  const trackParse = TrackSchema.safeParse(body);
  if (trackParse.success) {
    const { url, trackId } = trackParse.data;

    try {
      const { playlist } = await fetchPlaylistForUrl(platform, url);
      const track = playlist.tracks.find((t) => t.id === trackId);
      if (!track) {
        return errorResponse("Titre introuvable dans cette playlist.", 404, "TRACK_NOT_FOUND");
      }

      const { stream, contentType, ext } = await streamMusicTrackDownload(track, MP3_QUALITY);
      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${sanitizeFilename(
          `${track.artist ? track.artist + " - " : ""}${track.title}`
        )}.${ext}"`
      );
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(stream, { headers });
    } catch (e) {
      return errorResponse((e as Error).message, 502, "DOWNLOAD_FAILED");
    }
  }

  // ── Action : ZIP complet de la playlist ──
  const playlistParse = PlaylistSchema.safeParse(body);
  if (playlistParse.success) {
    const { url, limit } = playlistParse.data;

    try {
      const { playlist } = await fetchPlaylistForUrl(platform, url);
      const tracks = limit ? playlist.tracks.slice(0, limit) : playlist.tracks;
      if (tracks.length === 0) {
        return errorResponse("Aucun titre trouvé dans ce contenu.", 404, "EMPTY_PLAYLIST");
      }

      const { stream } = streamMusicPlaylistZip(
        { ...playlist, tracks, count: tracks.length },
        MP3_QUALITY
      );

      const headers = new Headers();
      headers.set("Content-Type", "application/zip");
      headers.set(
        "Content-Disposition",
        `attachment; filename="${sanitizeFilename(playlist.title || "playlist")}.zip"`
      );
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(stream, { headers });
    } catch (e) {
      return errorResponse((e as Error).message, 502, "PLAYLIST_DOWNLOAD_FAILED");
    }
  }

  return errorResponse("Paramètres invalides.", 400, "INVALID_REQUEST");
}
