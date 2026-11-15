import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  isYoutubePlaylist,
  extractUrl,
  YOUTUBE_REGEX,
} from "@/lib/platform";
import {
  getYoutubeInfo,
  getYoutubePlaylist,
  streamYoutubeDownload,
  streamYoutubePlaylistZip,
  MAX_PLAYLIST_ITEMS,
} from "@/lib/youtube";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  MAX_VIDEO_HEIGHT,
  MP3_BITRATE,
  MP3_QUALITY,
  isAudioQuality,
} from "@/lib/quality";
import { errorResponse, sanitizeFilename } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 600;

const InfoSchema = z.object({ action: z.literal("info"), url: z.string().min(1) });
const DownloadSchema = z.object({
  action: z.literal("download"),
  url: z.string().min(1),
  videoHeight: z.number().int().positive().optional(),
  formatId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  formatHasAudio: z.boolean().optional(),
  audioOnly: z.boolean().optional(),
  audioQuality: z.string().optional(),
  filename: z.string().optional(),
});
const PlaylistSchema = z.object({
  action: z.literal("playlist"),
  url: z.string().min(1),
  videoHeight: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(MAX_PLAYLIST_ITEMS).optional(),
});

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Corps de requête invalide.", 400);
  }

  // ── Action : informations (vidéo simple OU playlist) ──
  const infoParse = InfoSchema.safeParse(body);
  if (infoParse.success) {
    const url = extractUrl(infoParse.data.url);

    if (isYoutubePlaylist(url)) {
      try {
        const playlist = await getYoutubePlaylist(url);
        return Response.json({ ok: true, platform: "youtube", playlist });
      } catch (e) {
        return errorResponse((e as Error).message, 502, "PLAYLIST_FETCH_FAILED");
      }
    }

    if (!YOUTUBE_REGEX.test(url)) {
      return errorResponse("URL YouTube invalide.", 400, "INVALID_URL");
    }
    try {
      const info = await getYoutubeInfo(url);
      const formats = info.formats.filter((f) => f.height <= MAX_VIDEO_HEIGHT);
      return Response.json({
        ok: true,
        platform: "youtube",
        info,
        formats,
        audio: { maxBitrate: MP3_BITRATE },
      });
    } catch (e) {
      return errorResponse((e as Error).message, 502, "YOUTUBE_FETCH_FAILED");
    }
  }

  // ── Action : téléchargement d'une playlist complète (ZIP) ──
  const playlistParse = PlaylistSchema.safeParse(body);
  if (playlistParse.success) {
    const url = extractUrl(playlistParse.data.url);
    const { videoHeight, limit } = playlistParse.data;
    if (!isYoutubePlaylist(url)) {
      return errorResponse("URL de playlist YouTube invalide.", 400, "INVALID_URL");
    }

    try {
      const playlist = await getYoutubePlaylist(url);
      const entries = limit ? playlist.entries.slice(0, limit) : playlist.entries;
      if (entries.length === 0) {
        return errorResponse("Aucune vidéo trouvée dans cette playlist.", 404, "EMPTY_PLAYLIST");
      }

      const height = Math.min(videoHeight ?? 1080, MAX_VIDEO_HEIGHT);
      const { stream } = streamYoutubePlaylistZip(
        { ...playlist, entries, count: entries.length },
        height
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

  // ── Action : téléchargement d'une seule vidéo ──
  const downloadParse = DownloadSchema.safeParse(body);
  if (!downloadParse.success) {
    return errorResponse("Paramètres invalides.", 400, "INVALID_REQUEST");
  }
  const url = extractUrl(downloadParse.data.url);
  const { videoHeight, formatId, formatHasAudio, audioOnly, audioQuality, filename } =
    downloadParse.data;
  if (!YOUTUBE_REGEX.test(url)) {
    return errorResponse("URL YouTube invalide.", 400, "INVALID_URL");
  }

  try {
    const effectiveHeight = audioOnly
      ? undefined
      : Math.min(videoHeight ?? MAX_VIDEO_HEIGHT, MAX_VIDEO_HEIGHT);

    const { stream, contentType, ext, size } = await streamYoutubeDownload({
      url,
      videoHeight: effectiveHeight,
      formatId,
      formatHasAudio,
      audioOnly,
      mp3Quality: MP3_QUALITY,
      audioQuality: isAudioQuality(audioQuality) ? audioQuality : undefined,
    });

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", String(size));
    headers.set(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(filename ?? "video")}.${ext}"`
    );
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(stream, { headers });
  } catch (e) {
    return errorResponse((e as Error).message, 502, "DOWNLOAD_FAILED");
  }
}
