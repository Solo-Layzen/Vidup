import { spawn } from "node:child_process";
import { createReadStream, existsSync, stat as fsStat, unlink } from "node:fs";
import { randomBytes } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { streamZip, type ZipFileProducer } from "./zip";
import { sanitizeFilename } from "./utils";

/**
 * Binaire yt-dlp : on utilise YTDLP_PATH s'il pointe vers un fichier qui existe
 * réellement, sinon on retombe sur le PATH système. Évite les échecs silencieux
 * quand le chemin configuré est obsolète (mise à jour de Python, etc.).
 */
const YTDLP = (() => {
  const configured = process.env.YTDLP_PATH?.trim();
  if (!configured) return "yt-dlp";
  const looksLikePath = /[\\/]/.test(configured);
  if (looksLikePath && !existsSync(configured)) return "yt-dlp";
  return configured;
})();

/** Fichier de cookies optionnel (utile quand YouTube demande une vérification). */
const YTDLP_COOKIES = (() => {
  const file = process.env.YTDLP_COOKIES?.trim();
  return file && existsSync(file) ? file : null;
})();

function cookieArgs(): string[] {
  return YTDLP_COOKIES ? ["--cookies", YTDLP_COOKIES] : [];
}

/**
 * Localisation de ffmpeg pour yt-dlp. Si FFMPEG_PATH est absent ou invalide,
 * on ne force rien : yt-dlp cherchera ffmpeg dans le PATH.
 * Accepte aussi bien le dossier que le chemin complet vers ffmpeg.exe.
 */
function ffmpegLocationArgs(): string[] {
  const raw = process.env.FFMPEG_PATH?.trim();
  if (!raw) return [];
  const dir = /[\\/](?:ffmpeg|ffprobe)(?:\.exe)?$/i.test(raw) ? path.dirname(raw) : raw;
  return existsSync(dir) ? ["--ffmpeg-location", dir] : [];
}

export const MAX_PLAYLIST_ITEMS = 25;

export type YtFormat = {
  /** Identifiant de flux yt-dlp (permet de sélectionner une qualité exacte). */
  id: string;
  height: number;
  label: string;
  tbr: number | null;
  fps: number | null;
  ext: string;
  /** Codec vidéo simplifié (avc1, vp9, av01…). */
  vcodec: string | null;
  /** Plage dynamique : SDR, HDR, HLG… */
  dynamicRange: string | null;
  hasAudio: boolean;
  filesize: number | null;
};

export type YtInfo = {
  id: string;
  title: string;
  thumbnail: string;
  duration: number | null;
  author: string | null;
  uploadDate: string | null;
  formats: YtFormat[];
};

export function heightLabel(h: number): string {
  if (h >= 4320) return "8K";
  if (h >= 2880) return "5K";
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K (1440p)";
  return `${h}p`;
}

function shortCodec(vcodec: string | null): string | null {
  if (!vcodec || vcodec === "none") return null;
  const v = vcodec.toLowerCase();
  if (v.startsWith("av01") || v.includes("av1")) return "AV1";
  if (v.startsWith("vp9") || v.includes("vp9")) return "VP9";
  if (v.startsWith("avc") || v.includes("h264")) return "H.264";
  if (v.startsWith("hev") || v.includes("h265") || v.includes("hevc")) return "H.265";
  if (v.startsWith("vp8")) return "VP8";
  return vcodec.split(".")[0]?.slice(0, 12) ?? null;
}

export function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [...cookieArgs(), ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) =>
      resolve({ stdout, stderr: stderr + (err.message || ""), code: -1 })
    );
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

export function isYtdlpMissing(stderr: string, code: number | null): boolean {
  return (
    code === -1 ||
    /not (recognized|found)|'yt-dlp' n'est pas reconnu|ENOENT/.test(stderr)
  );
}

/**
 * Cherche sur YouTube la meilleure piste pour un titre musique.
 * Interroge `ytsearch10` puis note chaque résultat : correspondance
 * artiste/titre dans le nom, proximité de durée, présence de "official",
 * et pénalités sur les reprises / karaokés / remixes / instrumentaux
 * (souvent responsables d'un MP3 dont les paroles sont justes mais la
 * musique ne l'est pas).
 */
export async function findBestYouTubeMatch(
  query: string,
  opts?: { durationSec?: number | null; trackTitle?: string; artist?: string }
): Promise<{ url: string; title: string } | null> {
  const { stdout, stderr, code } = await runYtdlp([
    "--flat-playlist",
    "--no-warnings",
    "--no-progress",
    "-J",
    `ytsearch10:${query}`,
  ]);

  if (isYtdlpMissing(stderr, code)) {
    throw new Error("yt-dlp n'est pas installé sur le serveur.");
  }
  if (code !== 0 || !stdout) {
    return null;
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(stdout);
  } catch {
    return null;
  }

  const entries: Array<Record<string, any>> = data.entries ?? [];
  const candidates = entries
    .map((e) => ({
      id: e.id ?? "",
      title: e.title ?? "",
      duration: e.duration ?? null,
      channel: e.channel ?? e.uploader ?? "",
    }))
    .filter((e) => e.id && e.title);

  if (candidates.length === 0) return null;

  const durationSec = opts?.durationSec ?? null;
  const trackTitle = opts?.trackTitle ?? "";
  const artist = opts?.artist ?? "";

  const scored = candidates.map((c, i) => ({
    ...c,
    score: scoreMusicCandidate(
      c,
      {
        artist,
        trackTitle,
        durationSec: durationSec && durationSec > 0 ? durationSec : null,
      }
    ),
    index: i,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = durationSec && a.duration ? Math.abs(a.duration - durationSec) : 0;
    const db = durationSec && b.duration ? Math.abs(b.duration - durationSec) : 0;
    if (da !== db) return da - db;
    return a.index - b.index;
  });

  const best = scored[0];
  return {
    url: `https://www.youtube.com/watch?v=${best.id}`,
    title: best.title,
  };
}

type MusicCandidate = {
  id: string;
  title: string;
  duration: number | null;
  channel: string;
};

const SEARCH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "without",
  "feat", "featuring", "ft", "feat.", "vs", "remix", "remastered", "version",
  "official", "audio", "lyrics", "lyric", "video", "music", "song", "album",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SEARCH_STOPWORDS.has(w));
}

/** Marqueurs d'une véritable piste officielle (audio = la bonne musique). */
const OFFICIAL_RE = /\bofficial(?:\s+(?:audio|video|audio\s+video|music\s+video|lyrics?\s+video))?\b/;
const AUDIO_RE = /\b(?:audio|audio\s+video)\b/;

/** Termes typiques d'un audio différent de l'original (reprise, karaoké, remix…). */
const BAD_AUDIO_RE =
  /karaoke|instrumental|minus ?one|backing ?track|no ?vocals|slowed|reverb|sped ?up|nightcore|\b8d\b|acoustic|lo[- ]?fi|lofi|tribute|mashup|type ?beat|remix|remake|cover(?:ed)?\s+by|\bcover\s+song\b|\(?\[\s*cover\s*[)\]]|reaction|parody|video\s+remix|dj\s+remix/;

function scoreMusicCandidate(
  c: MusicCandidate,
  m: { artist: string; trackTitle: string; durationSec: number | null }
): number {
  let score = 0;
  const candLower = c.title.toLowerCase();
  const candTokens = tokenize(c.title);
  const candStr = candTokens.join(" ");
  const title = (m.trackTitle || "").toLowerCase();
  const artist = (m.artist || "").toLowerCase();

  // Durée : gros bonus si très proche de l'original, pénalité si trop éloignée.
  if (m.durationSec && c.duration && c.duration > 0) {
    const diff = Math.abs(c.duration - m.durationSec);
    if (diff <= 6) score += 25;
    else if (diff <= 20) score += 12;
    else if (diff > 60) score -= Math.min(90, diff);
  }

  // Couverture des mots du titre (l'audio est la bonne piste si le titre colle).
  const titleTokens = tokenize(m.trackTitle || "");
  const titleHits = titleTokens.filter((t) => candStr.includes(t)).length;
  const titleRatio = titleTokens.length ? titleHits / titleTokens.length : 0;
  score += 35 * titleRatio;
  if (title.length > 6 && candLower.includes(title)) score += 15;

  // Couverture des mots de l'artiste (chaîne officielle très probable).
  const artistTokens = tokenize(m.artist || "");
  const artistHits = artistTokens.filter((t) => candStr.includes(t)).length;
  const artistRatio = artistTokens.length ? artistHits / artistTokens.length : 0;
  score += 30 * artistRatio;
  if (artist.length > 2 && candLower.includes(artist)) score += 10;

  // Le canal porte le nom de l'artiste → upload officiel.
  const channelLower = (c.channel || "").toLowerCase();
  const artistLast = artist.split(/\s+/).filter((w) => w.length > 3).pop() ?? "";
  if (artistLast && channelLower.includes(artistLast)) score += 12;

  // Marqueur "official" / "(audio)" → très probablement la vraie piste.
  if (OFFICIAL_RE.test(candLower)) score += 22;
  else if (AUDIO_RE.test(candLower)) score += 6;

  // Titre "propre" : peu de mots en plus de l'artiste + du titre.
  const extra = candTokens.filter(
    (t) => !artistTokens.includes(t) && !titleTokens.includes(t)
  ).length;
  if (extra <= 2) score += 12;

  // Audio différent de l'original → grosse pénalité.
  if (BAD_AUDIO_RE.test(candLower)) score -= 45;

  // Vidéo "lyrics" : souvent une re-synthèse audio (paroles bonnes, musique non).
  if (/\blyrics?\b|\bletra\b|subtitul|\bkaraok\b/.test(candLower)) score -= 14;

  return score;
}

/**
 * Télécharge une vidéo dans un fichier temporaire (sortie disque → vrai MP4,
 * pas de flux TS comme avec `-o -`), puis la stream au client.
 *
 * - `formatId` fourni → qualité exacte choisie dans la liste (4K 60 fps HDR…).
 * - sinon `videoHeight` → meilleur flux ≤ cette hauteur.
 * - `audioOnly` → extraction audio MP3 (débit `audioQuality`).
 */
export async function streamYoutubeDownload(opts: {
  url: string;
  videoHeight?: number;
  formatId?: string;
  formatHasAudio?: boolean;
  audioOnly?: boolean;
  mp3Quality: string;
  audioQuality?: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; ext: string; size: number }> {
  const args = ["--no-warnings", "--no-playlist", "--no-progress"];
  args.push(...ffmpegLocationArgs());

  let ext = "mp4";
  let contentType = "video/mp4";

  if (opts.audioOnly) {
    args.push(
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      opts.audioQuality || opts.mp3Quality
    );
    ext = "mp3";
    contentType = "audio/mpeg";
  } else if (opts.formatId) {
    // Le flux vidéo exact est épinglé ; on lui ajoute la meilleure piste audio
    // sauf s'il contient déjà le son (formats progressifs 360p/720p).
    const selector = opts.formatHasAudio ? opts.formatId : `${opts.formatId}+ba`;
    args.push("-f", selector, "--merge-output-format", "mp4");
  } else {
    const h = opts.videoHeight ?? 1080;
    // Pas de fallback /b[...] : on force la fusion bv*+ba → vrai conteneur MP4.
    args.push("-f", `bv*[height<=${h}]+ba`, "--merge-output-format", "mp4");
  }
  args.push(opts.url);

  const tmpFile = path.join(os.tmpdir(), `vidup-${randomBytes(8).toString("hex")}.${ext}`);
  const size = await runYtdlpToFile(args, tmpFile);
  return { stream: fileToWebStream(tmpFile, size), contentType, ext, size };
}

/** Lance yt-dlp en sortie fichier ; renvoie la taille du fichier (ou jette). */
async function runYtdlpToFile(args: string[], outFile: string): Promise<number> {
  const fullArgs = [...cookieArgs(), ...args, "-o", outFile];
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, fullArgs, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      unlink(outFile, () => {});
      reject(new Error(err.message || "yt-dlp n'est pas disponible sur le serveur."));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        unlink(outFile, () => {});
        reject(new Error(parseYtdlpError(stderr)));
        return;
      }
      fsStat(outFile, (err, st) => {
        if (err || !st || st.size === 0) {
          unlink(outFile, () => {});
          const detail = stderr.trim() ? parseYtdlpError(stderr) : "";
          reject(
            new Error(
              detail ||
                "Le fichier n'a pas pu être créé (souvent ffmpeg absent). Vérifiez FFMPEG_PATH ou le PATH."
            )
          );
          return;
        }
        resolve(st.size);
      });
    });
  });
}

/**
 * Transforme un fichier en ReadableStream web, supprimé après lecture (ou annulation).
 * Lecture « pull » = backpressure respectée : on ne charge pas tout le fichier
 * en mémoire quand le client télécharge lentement.
 */
function fileToWebStream(file: string, _size: number): ReadableStream<Uint8Array> {
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;
      unlink(file, () => {});
    }
  };
  const nodeStream = createReadStream(file, { highWaterMark: 1024 * 1024 });
  const iterator = nodeStream[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          cleanup();
          return;
        }
        controller.enqueue(new Uint8Array(value as Buffer));
      } catch (err) {
        controller.error(err);
        cleanup();
      }
    },
    cancel() {
      nodeStream.destroy();
      cleanup();
    },
  });
}

function parseYtdlpError(stderr: string): string {
  const s = stderr.trim();
  if (!s) return "Impossible de télécharger cette vidéo (vidéo privée, région bloquée ou format indisponible).";

  if (/ffmpeg.*(not found|not installed)|ffprobe.*(not found|not installed)|ffmpeg-location|postprocessing|merging/i.test(s)) {
    return "ffmpeg est introuvable ou n'a pas pu fusionner le fichier. Installez ffmpeg et vérifiez FFMPEG_PATH (ou ajoutez-le au PATH).";
  }
  if (/CONNECT tunnel failed|ProxyError|proxy|tunnel/i.test(s)) {
    return "La connexion est bloquée par un VPN/proxy (Cloudflare WARP, etc.). Désactivez-le puis réessayez.";
  }
  if (/sign in to confirm|not a bot|confirm you'?re not a bot|too many requests|HTTP Error 429/i.test(s)) {
    return "La plateforme limite les téléchargements depuis ce serveur (vérification anti-robot). Réessayez plus tard, ou configurez YTDLP_COOKIES avec un fichier de cookies.";
  }
  if (/video unavailable|not available|has been removed|does not exist/i.test(s)) {
    return "Cette vidéo n'est plus disponible ou a été supprimée.";
  }
  if (/private|priv/i.test(s)) return "Cette vidéo est privée ou non disponible.";
  if (/region|geo|not available in your country/i.test(s)) return "Cette vidéo est bloquée dans votre région.";
  if (/age|sign in to confirm|confirm your age/i.test(s)) return "Cette vidéo est soumise à une restriction d'âge.";
  if (/playlist/i.test(s)) return "Cette playlist est vide, privée ou indisponible.";
  if (/requested format|format is not available/i.test(s)) {
    return "Ce format n'est pas disponible pour cette vidéo. Choisissez une autre qualité.";
  }

  // Message le plus utile : la dernière ligne ERROR de yt-dlp.
  const errorLine = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /error/i.test(l))
    .pop();
  const first = errorLine ?? s.split("\n")[0] ?? s;
  return first.slice(0, 300);
}

// ─────────────────────────────────────────────
// Cache mémoire des infos vidéo (TTL 5 min) → l'analyse
// est quasi instantanée lors des demandes répétées.
const infoCache = new Map<string, { time: number; info: YtInfo }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getYoutubeInfo(url: string, useCache = true): Promise<YtInfo> {
  const videoId = url.match(/[a-zA-Z0-9_-]{11}/)?.[0] ?? url;
  if (useCache) {
    const cached = infoCache.get(videoId);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.info;
  }

  const { stdout, stderr, code } = await runYtdlp([
    "--no-warnings",
    "--no-playlist",
    "-J",
    url,
  ]);

  if (isYtdlpMissing(stderr, code)) {
    throw new Error("yt-dlp n'est pas installé sur le serveur.");
  }
  if (code !== 0 || !stdout) {
    throw new Error(parseYtdlpError(stderr));
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error("Impossible d'analyser les informations de la vidéo.");
  }

  const rawFormats: Array<Record<string, any>> = data.formats ?? [];

  // Formats vidéo réels, dédupliqués par (hauteur, fps, HDR, codec) → on garde
  // le meilleur débit de chaque variante. On expose l'id exact du flux pour
  // permettre une sélection « à la carte » (4K 60 fps HDR, AV1, etc.).
  const byKey = new Map<string, Record<string, any>>();
  for (const f of rawFormats) {
    const vcodec = f.vcodec;
    if (!vcodec || vcodec === "none") continue;
    const h = f.height ?? 0;
    if (!h) continue;
    const fps = f.fps ? Math.round(f.fps) : 0;
    const dr = f.dynamic_range && f.dynamic_range !== "SDR" ? String(f.dynamic_range) : "";
    const codecKey = shortCodec(vcodec) ?? vcodec;
    const key = `${h}|${fps}|${dr}|${codecKey}`;
    const current = byKey.get(key);
    if (!current || (f.tbr ?? 0) > (current.tbr ?? 0)) byKey.set(key, f);
  }

  const formats: YtFormat[] = [...byKey.values()]
    .sort((a, b) => {
      if ((b.height ?? 0) !== (a.height ?? 0)) return (b.height ?? 0) - (a.height ?? 0);
      if ((b.fps ?? 0) !== (a.fps ?? 0)) return (b.fps ?? 0) - (a.fps ?? 0);
      return (b.tbr ?? 0) - (a.tbr ?? 0);
    })
    .map((f) => ({
      id: String(f.format_id ?? ""),
      height: f.height ?? 0,
      label: heightLabel(f.height ?? 0),
      tbr: f.tbr ? Math.round(f.tbr) : null,
      fps: f.fps ? Math.round(f.fps) : null,
      ext: f.ext ?? "mp4",
      vcodec: shortCodec(f.vcodec ?? null),
      dynamicRange: f.dynamic_range && f.dynamic_range !== "SDR" ? String(f.dynamic_range) : null,
      hasAudio: !!f.acodec && f.acodec !== "none",
      filesize: f.filesize ?? f.filesize_approx ?? null,
    }))
    .filter((f) => f.id);

  const info: YtInfo = {
    id: data.id ?? "",
    title: data.title ?? "Vidéo sans titre",
    thumbnail: data.thumbnail ?? "",
    duration: data.duration ?? null,
    author: data.uploader ?? data.channel ?? null,
    uploadDate: data.upload_date ?? null,
    formats,
  };

  infoCache.set(videoId, { time: Date.now(), info });
  if (infoCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of infoCache) {
      if (now - v.time > CACHE_TTL_MS) infoCache.delete(k);
    }
  }
  return info;
}

// ─────────────────────────────────────────────
// Playlists
export type YtPlaylistEntry = {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
};

export type YtPlaylist = {
  id: string;
  title: string;
  count: number;
  entries: YtPlaylistEntry[];
};

export async function getYoutubePlaylist(url: string): Promise<YtPlaylist> {
  const { stdout, stderr, code } = await runYtdlp([
    "--flat-playlist",
    "--no-warnings",
    "-J",
    url,
  ]);

  if (isYtdlpMissing(stderr, code)) {
    throw new Error("yt-dlp n'est pas installé sur le serveur.");
  }
  if (code !== 0 || !stdout) {
    throw new Error(parseYtdlpError(stderr));
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error("Impossible d'analyser la playlist.");
  }

  const entries: YtPlaylistEntry[] = (data.entries ?? [] as any[])
    .map((e: Record<string, any>): YtPlaylistEntry => ({
      id: e.id ?? "",
      title: e.title ?? "Vidéo",
      duration: e.duration ?? null,
      thumbnail:
        e.thumbnails?.[0]?.url ?? e.thumbnail ?? "",
    }))
    .filter((e: YtPlaylistEntry) => e.id)
    .slice(0, MAX_PLAYLIST_ITEMS);

  return {
    id: data.id ?? "",
    title: data.title ?? "Playlist",
    count: entries.length,
    entries,
  };
}

/**
 * Producteur async pour le ZIP : télécharge UNE vidéo de la playlist
 * (yt-dlp → fichier temporaire, vrai MP4) puis stream son contenu.
 * Annulable via la fermeture du générateur.
 */
export function ytPlaylistVideoProducer(url: string, videoHeight: number): ZipFileProducer {
  return async function* () {
    const args = ["--no-warnings", "--no-playlist", "--no-progress"];
    args.push(...ffmpegLocationArgs());
    args.push(
      "-f",
      `bv*[height<=${videoHeight}]+ba`,
      "--merge-output-format",
      "mp4",
      url
    );

    const tmpFile = path.join(os.tmpdir(), `vidup-pl-${randomBytes(8).toString("hex")}.mp4`);
    try {
      await runYtdlpToFile(args, tmpFile);
      const nodeStream = createReadStream(tmpFile);
      try {
        for await (const chunk of nodeStream) {
          yield chunk as Uint8Array;
        }
      } finally {
        nodeStream.destroy();
      }
    } finally {
      unlink(tmpFile, () => {});
    }
  };
}

/**
 * ZIP streamé de la playlist : chaque vidéo est téléchargée en fichier
 * temporaire (vrai MP4) puis injectée dans l'archive à la volée.
 * Les vidéos indisponibles sont sautées et listées dans un fichier de rapport.
 */
export function streamYoutubePlaylistZip(
  playlist: YtPlaylist,
  videoHeight: number
): { stream: ReadableStream<Uint8Array>; failures: string[] } {
  const failures: string[] = [];
  const usedNames = new Set<string>();
  const files = playlist.entries.map((entry) => {
    let name = `${sanitizeFilename(entry.title)}.mp4`;
    if (usedNames.has(name)) {
      let i = 2;
      while (usedNames.has(`${name.slice(0, -4)} (${i}).mp4`)) i++;
      name = `${name.slice(0, -4)} (${i}).mp4`;
    }
    usedNames.add(name);
    return {
      name,
      produce: ytPlaylistVideoProducer(
        `https://www.youtube.com/watch?v=${entry.id}`,
        videoHeight
      ),
    };
  });

  const { stream } = streamZip(files, {
    failureFileName: "_videos-indisponibles.txt",
    onError: (name, msg) => failures.push(`${name} : ${msg}`),
  });
  return { stream, failures };
}
