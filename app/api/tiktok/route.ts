import type { NextRequest } from "next/server";
import { z } from "zod";
import { TIKTOK_REGEX, extractUrl } from "@/lib/platform";
import { getTikTokInfo, streamTiktokVideo, streamTiktokAudio } from "@/lib/tiktok";
import { checkRateLimit } from "@/lib/rate-limit";
import { MP3_BITRATE, MP3_QUALITY } from "@/lib/quality";
import { errorResponse, sanitizeFilename } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const InfoSchema = z.object({ action: z.literal("info"), url: z.string().min(1) });
const DownloadSchema = z.object({
  action: z.literal("download"),
  url: z.string().min(1),
  type: z.enum(["video", "audio"]),
  quality: z.enum(["standard", "hd"]).optional().default("standard"),
  filename: z.string().optional(),
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

  // ── Action : infos vidéo TikTok (sans filigrane) ──
  const infoParse = InfoSchema.safeParse(body);
  if (infoParse.success) {
    const url = extractUrl(infoParse.data.url);
    if (!TIKTOK_REGEX.test(url)) {
      return errorResponse("URL TikTok invalide.", 400, "INVALID_URL");
    }
    try {
      const info = await getTikTokInfo(url);
      return Response.json({
        ok: true,
        platform: "tiktok",
        info,
        options: {
          hdAvailable: !!info.hdPlayUrl,
          mp3Quality: MP3_QUALITY,
          maxBitrate: MP3_BITRATE,
        },
      });
    } catch (e) {
      return errorResponse((e as Error).message, 502, "TIKTOK_FETCH_FAILED");
    }
  }

  // ── Action : téléchargement ──
  const downloadParse = DownloadSchema.safeParse(body);
  if (!downloadParse.success) {
    return errorResponse("Paramètres invalides.", 400, "INVALID_REQUEST");
  }
  const url = extractUrl(downloadParse.data.url);
  const { type, quality, filename } = downloadParse.data;
  if (!TIKTOK_REGEX.test(url)) {
    return errorResponse("URL TikTok invalide.", 400, "INVALID_URL");
  }

  try {
    if (type === "audio") {
      const { stream, contentType, ext } = await streamTiktokAudio(url, MP3_QUALITY);
      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${sanitizeFilename(filename ?? "audio-tiktok")}.${ext}"`
      );
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(stream, { headers });
    }

    const info = await getTikTokInfo(url);
    const videoResp = await streamTiktokVideo(info, {
      useHd: quality === "hd",
      filename: sanitizeFilename(filename ?? "tiktok-no-watermark"),
    });
    return videoResp;
  } catch (e) {
    return errorResponse((e as Error).message, 502, "DOWNLOAD_FAILED");
  }
}
