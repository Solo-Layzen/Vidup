import { getTikTokVideoId } from "./platform";
import { streamYoutubeDownload } from "./youtube";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

type TiktokItemStruct = {
  id?: string;
  desc?: string;
  video: {
    playAddr?: string;
    play?: string;
    hdPlay?: string;
    hdPlayAddr?: string;
    cover?: string;
    duration?: number;
  };
  author?: { uniqueId?: string };
};

type TiktokScopeEntry = { itemInfo?: { itemStruct?: TiktokItemStruct } };

export type TiktokInfo = {
  id: string;
  title: string;
  cover: string;
  duration: number | null;
  author: string | null;
  /** URL vidéo SANS filigrane (playAddr, watermark=0). */
  playUrl: string;
  hdPlayUrl: string | null;
};

export async function getTikTokInfo(rawUrl: string): Promise<TiktokInfo> {
  const videoId = getTikTokVideoId(rawUrl);
  if (!videoId) {
    throw new Error("Lien TikTok invalide.");
  }

  // Résout les liens courts (vt.tiktok.com, tiktok.com/t/...) vers l'URL canonique.
  let canonicalUrl = rawUrl;
  if (/vt\.tiktok\.com|tiktok\.com\/t\//i.test(rawUrl)) {
    const resp = await fetch(rawUrl, {
      redirect: "follow",
      headers: { "User-Agent": MOBILE_UA },
    });
    canonicalUrl = resp.url || rawUrl;
    if (!getTikTokVideoId(canonicalUrl)) {
      throw new Error("Impossible de résoudre ce lien TikTok raccourci.");
    }
  }

  const page = await fetch(canonicalUrl, {
    headers: {
      "User-Agent": MOBILE_UA,
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (page.status === 404 || page.status === 4040) {
    throw new Error("Cette vidéo TikTok n'existe plus ou est privée.");
  }
  if (page.status === 403) {
    throw new Error("TikTok a bloqué la requête. Réessayez dans quelques minutes.");
  }
  if (!page.ok) {
    throw new Error("Impossible de récupérer la vidéo TikTok (statut " + page.status + ").");
  }

  const html = await page.text();
  const parsed = extractRehydrationData(html);
  if (!parsed) {
    throw new Error(
      "TikTok ne nous laisse pas récupérer cette vidéo pour le moment. Réessayez plus tard."
    );
  }

  const { title, cover, duration, author, playUrl, hdPlayUrl } = parsed;
  return { id: videoId, title, cover, duration, author, playUrl, hdPlayUrl };
}

function extractRehydrationData(html: string): TiktokInfo | null {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>\s*(\{.*?\})\s*<\/script>/s
  );
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const scope = data?.__DEFAULT_SCOPE__;
    if (!scope) return null;

    // TikTok a changé plusieurs fois la clé de scope ("webapp.video-detail",
    // désormais "webapp.reflow.video.detail"...). On parcourt toutes les entrées
    // pour trouver celle qui contient réellement l'item vidéo.
    let item: TiktokItemStruct | null = null;
    for (const value of Object.values(scope) as TiktokScopeEntry[]) {
      const candidate = value?.itemInfo?.itemStruct;
      if (candidate?.video?.playAddr || candidate?.video?.play) {
        item = candidate;
        break;
      }
    }
    if (!item) return null;

    const video = item.video;
    const play = video.playAddr || video.play || "";
    const hd = video.hdPlay || video.hdPlayAddr || null;
    const withScheme = (u: string) => (u.startsWith("//") ? "https:" + u : u);

    return {
      id: item.id ?? "",
      title: (item.desc || "Vidéo TikTok").slice(0, 150),
      cover: video.cover ?? "",
      duration: video.duration ?? null,
      author: item.author?.uniqueId ?? null,
      playUrl: play ? withScheme(play) : "",
      hdPlayUrl: hd ? withScheme(hd) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Proxy la vidéo TikTok sans filigrane (headers UA/Referer requis par TikTok CDN).
 * Retourne une réponse streamée prête à renvoyer au client.
 */
export async function streamTiktokVideo(
  info: TiktokInfo,
  opts: { useHd?: boolean; filename?: string } = {}
): Promise<Response> {
  const url =
    (opts.useHd ? info.hdPlayUrl : info.playUrl) || info.hdPlayUrl || info.playUrl;
  if (!url) {
    throw new Error("Impossible d'obtenir l'URL vidéo sans filigrane.");
  }

  const resp = await fetch(url, {
    headers: {
      "User-Agent": MOBILE_UA,
      Referer: "https://www.tiktok.com/",
      Accept: "*/*",
    },
  });

  if (resp.status === 403 || resp.status === 451) {
    throw new Error(
      "TikTok refuse le téléchargement depuis ce réseau (VPN/proxy). Désactivez Cloudflare WARP ou votre VPN, puis réessayez."
    );
  }
  if (!resp.ok || !resp.body) {
    throw new Error("Impossible de télécharger la vidéo TikTok (statut " + resp.status + ").");
  }

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${(opts.filename ?? "tiktok-no-watermark").replace(/["\\]/g, "")}.mp4"`
  );
  headers.set("X-Content-Type-Options", "nosniff");
  const length = resp.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(resp.body as ReadableStream, { headers });
}

/** Extraction audio MP3 d'un TikTok via yt-dlp. */
export async function streamTiktokAudio(url: string, mp3Quality: string) {
  return streamYoutubeDownload({ url, audioOnly: true, mp3Quality });
}
