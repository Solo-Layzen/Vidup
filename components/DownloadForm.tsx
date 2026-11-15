"use client";

import { useState } from "react";
import { detectPlatform, extractUrl, type Platform } from "@/lib/platform";
import { apiUrl } from "@/lib/api";
import PlatformBadge from "./PlatformBadge";
import ProgressBar from "./ProgressBar";

type PlaylistData = {
  id: string;
  title: string;
  count: number;
  entries: {
    id: string;
    title: string;
    duration: number | null;
    thumbnail: string;
  }[];
};

type MusicTrackData = {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
  cover: string;
};

type MusicPlaylistData = {
  id: string;
  title: string;
  count: number;
  total?: number;
  cover: string;
  tracks: MusicTrackData[];
};

type InfoData =
  | {
      platform: "youtube";
      title: string;
      thumbnail: string;
      duration: number | null;
      author: string | null;
      formats: {
        id: string;
        height: number;
        label: string;
        tbr: number | null;
        fps: number | null;
        ext: string;
        vcodec: string | null;
        dynamicRange: string | null;
        hasAudio: boolean;
        filesize: number | null;
      }[];
      audio: { maxBitrate: number };
    }
  | {
      platform: "youtube";
      playlist: PlaylistData;
    }
  | {
      platform: "tiktok";
      title: string;
      thumbnail: string;
      duration: number | null;
      author: string | null;
      hdAvailable: boolean;
    }
  | {
      platform: "spotify" | "deezer";
      playlist: MusicPlaylistData;
    };

type DownloadState = {
  label: string;
  state: "starting" | "streaming" | "saving";
  received: number;
  total: number;
};

const PLAYLIST_LIMITS = [null, 5, 10, 25] as const;
const PLAYLIST_QUALITIES = [480, 720, 1080, 1440, 2160, 4320] as const;
const AUDIO_QUALITY_OPTIONS = [
  { value: "320K", label: "MP3 320 kbit/s" },
  { value: "256K", label: "MP3 256 kbit/s" },
  { value: "192K", label: "MP3 192 kbit/s" },
  { value: "128K", label: "MP3 128 kbit/s" },
] as const;

export default function DownloadForm() {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<DownloadState | null>(null);
  const [playlistQuality, setPlaylistQuality] = useState(1080);
  const [playlistLimit, setPlaylistLimit] = useState<(typeof PLAYLIST_LIMITS)[number]>(null);
  const [audioQuality, setAudioQuality] = useState<string>("320K");

  const isMusic = platform === "spotify" || platform === "deezer";

  const onUrlChange = (value: string) => {
    const clean = extractUrl(value);
    setUrl(clean);
    setPlatform(detectPlatform(clean));
    setIsPlaylist(
      /youtube\.com\/playlist\?list=/.test(clean) ||
        /spotify\.com\/[^/]*\/(?:playlist|album)\//i.test(clean) ||
        /deezer\.com\/(?:[a-z]{2,}(?:-[a-z]{2,})?\/)?(?:playlist|album)\//i.test(clean)
    );
    setError(null);
    setSuccess(null);
  };

  const analyze = async () => {
    if (
      platform !== "youtube" &&
      platform !== "tiktok" &&
      platform !== "spotify" &&
      platform !== "deezer"
    ) {
      setError("Veuillez saisir une URL YouTube, TikTok, Spotify ou Deezer valide.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    setInfo(null);

    try {
      const res = await fetch(apiUrl(`/api/${platform}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "info", url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Impossible d'analyser le contenu.");
        return;
      }

      if (platform === "spotify" || platform === "deezer") {
        if (data.playlist) {
          setInfo({ platform, playlist: data.playlist });
        } else {
          setError("Impossible de récupérer les titres de cette playlist.");
        }
      } else if (data.playlist) {
        setInfo({ platform: "youtube", playlist: data.playlist });
      } else if (platform === "youtube") {
        setInfo({
          platform: "youtube",
          title: data.info.title,
          thumbnail: data.info.thumbnail,
          duration: data.info.duration,
          author: data.info.author,
          formats: data.formats,
          audio: data.audio,
        });
      } else {
        setInfo({
          platform: "tiktok",
          title: data.info.title,
          thumbnail: data.info.cover,
          duration: data.info.duration,
          author: data.info.author,
          hdAvailable: data.options.hdAvailable,
        });
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setAnalyzing(false);
    }
  };

  const download = async (
    payload: Record<string, unknown>,
    label: string,
    fallbackName: string
  ) => {
    if (
      platform !== "youtube" &&
      platform !== "tiktok" &&
      platform !== "spotify" &&
      platform !== "deezer"
    )
      return;

    setError(null);
    setSuccess(null);
    setDownloading({ label, state: "starting", received: 0, total: 0 });

    try {
      const res = await fetch(apiUrl(`/api/${platform}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || contentType.includes("application/json")) {
        const text = await res.text().catch(() => "");
        let message = "";
        try {
          message = JSON.parse(text)?.error?.message ?? "";
        } catch {
          /* réponse non JSON */
        }
        setError(
          message ||
            `Échec du téléchargement (erreur ${res.status}). Vérifiez que le contenu est accessible.`
        );
        return;
      }

      if (!res.body) throw new Error("no body");

      const total = Number(res.headers.get("content-length") || 0);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      setDownloading({ label, state: "streaming", received: 0, total });

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          setDownloading((s) =>
            s && s.state !== "saving" ? { ...s, received, total } : s
          );
        }
      }

      if (received === 0) {
        setError("Le serveur n'a renvoyé aucun fichier. Réessayez.");
        return;
      }

      setDownloading((s) => (s ? { ...s, state: "saving", received, total } : s));
      const blob = new Blob(chunks as BlobPart[], {
        type: contentType || "application/octet-stream",
      });
      const filename = parseFilename(res.headers.get("content-disposition"), fallbackName);

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Ne pas révoquer immédiatement : certains navigateurs annulent alors
      // le téléchargement du fichier encore en cours d'écriture.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

      setSuccess(`« ${label} » téléchargé avec succès.`);
    } catch {
      setError("Erreur réseau pendant le téléchargement. Réessayez.");
    } finally {
      setDownloading(null);
    }
  };

  /** Téléchargement direct sans passer par l'analyse (bien plus rapide). */
  const quickDownload = () => {
    if (isPlaylist || (platform !== "youtube" && platform !== "tiktok")) return;
    if (platform === "youtube") {
      download(
        { action: "download", url, videoHeight: 1080 },
        "Téléchargement rapide (1080p)",
        "video-quick.mp4"
      );
    } else {
      download(
        { action: "download", url, type: "video", quality: "standard" },
        "Téléchargement rapide (sans filigrane)",
        "tiktok-quick.mp4"
      );
    }
  };

  const canQuickDownload = (platform === "youtube" || platform === "tiktok") && !isPlaylist;

  const downloadTrack = (track: MusicTrackData) => {
    download(
      { action: "track", url, trackId: track.id },
      trackLabel(track),
      `${slugify(trackLabel(track))}.mp3`
    );
  };

  const downloadMusicZip = () => {
    if (!info || !("playlist" in info) || info.platform === "youtube") return;
    if (info.platform !== "spotify" && info.platform !== "deezer") return;
    download(
      { action: "playlist", url },
      `Playlist « ${info.playlist.title} » (MP3)`,
      `${slugify(info.playlist.title)}.zip`
    );
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Zone de saisie */}
      <div className="card">
        <label htmlFor="url" className="mb-2 block text-sm font-semibold text-gray-700">
          Collez l'URL de la vidéo, de la playlist ou de la musique
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (canQuickDownload ? quickDownload() : analyze())}
            placeholder="https://youtube.com/watch?v=... · /playlist?list=... · https://tiktok.com/@user/video/... · spotify · deezer"
            className="input"
            disabled={!!downloading}
          />
          {canQuickDownload && (
            <button
              type="button"
              onClick={quickDownload}
              disabled={analyzing || !!downloading}
              className="btn-primary sm:shrink-0"
            >
              ⚡ Téléchargement rapide
            </button>
          )}
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing || !!downloading}
            className={canQuickDownload ? "btn-secondary sm:shrink-0" : "btn-primary sm:shrink-0"}
          >
            {analyzing ? "Analyse…" : "Choisir le format"}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {url && <PlatformBadge platform={platform} />}
          {isMusic && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              Musique détectée
            </span>
          )}
          {!isMusic && isPlaylist && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              Playlist détectée
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      {downloading && (
        <ProgressBar
          label={
            downloading.state === "starting" ? "Préparation du fichier…" : downloading.label
          }
          progress={
            downloading.total > 0 && downloading.received > 0
              ? (downloading.received / downloading.total) * 100
              : null
          }
          received={downloading.received}
          total={downloading.total}
        />
      )}

      {/* Carte playlist YouTube */}
      {info && "playlist" in info && info.platform === "youtube" && (
        <div className="card mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold leading-snug">{info.playlist.title}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {info.playlist.count} vidéo{info.playlist.count > 1 ? "s" : ""} dans l'archive
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Qualité</label>
              <select
                value={playlistQuality}
                onChange={(e) => setPlaylistQuality(Number(e.target.value))}
                disabled={!!downloading}
                className="input !w-24 !px-2 !py-2 text-xs"
              >
                {PLAYLIST_QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q >= 4320 ? "8K" : q >= 2160 ? "4K" : q >= 1440 ? "2K" : `${q}p`}
                  </option>
                ))}
              </select>
              <label className="text-xs font-medium text-gray-500">Vidéos</label>
              <select
                value={playlistLimit === null ? "all" : String(playlistLimit)}
                onChange={(e) =>
                  setPlaylistLimit(
                    e.target.value === "all" ? null : (Number(e.target.value) as 5 | 10 | 25)
                  )
                }
                disabled={!!downloading}
                className="input !w-24 !px-2 !py-2 text-xs"
              >
                {PLAYLIST_LIMITS.map((l) => (
                  <option key={String(l)} value={l === null ? "all" : String(l)}>
                    {l === null ? "Toutes" : `${l} premières`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={!!downloading}
            onClick={() =>
              download(
                {
                  action: "playlist",
                  url,
                  videoHeight: playlistQuality,
                  limit: playlistLimit ?? undefined,
                },
                `Playlist « ${info.playlist.title} »`,
                `${slugify(info.playlist.title)}.zip`
              )
            }
            className="btn-primary mt-4 w-full"
          >
            📦 Télécharger la playlist (ZIP)
          </button>

          <ul className="mt-4 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
            {info.playlist.entries.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 shrink-0 text-center text-xs font-bold text-gray-400">
                  {i + 1}
                </span>
                {e.thumbnail && (
                  <img
                    src={e.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-10 w-16 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  {e.duration ? (
                    <p className="text-xs text-gray-400">{formatDuration(e.duration)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Carte musique Spotify / Deezer */}
      {info && "playlist" in info && (info.platform === "spotify" || info.platform === "deezer") && (
        <MusicPlaylistCard
          info={info}
          downloading={downloading}
          onDownloadTrack={downloadTrack}
          onDownloadZip={downloadMusicZip}
        />
      )}

      {/* Carte infos vidéo */}
      {info && "title" in info && (
        <div className="card mt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <img
              src={info.thumbnail}
              alt={info.title}
              className="h-40 w-full rounded-xl object-cover sm:w-56"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 font-semibold leading-snug">{info.title}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {info.author && <>Par {info.author}</>}
                {info.duration ? <> · Durée : {formatDuration(info.duration)}</> : null}
              </p>
              {info.platform === "tiktok" && (
                <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Vidéo sans filigrane
                </span>
              )}
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-gray-700">Choisissez un format</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {info.platform === "youtube" ? (
                <>
                  {info.formats.length === 0 && (
                    <p className="col-span-2 text-sm text-gray-500 sm:col-span-3">
                      Aucun format vidéo détecté. Essayez l'extraction MP3 ci-dessous.
                    </p>
                  )}
                  {info.formats.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={!!downloading}
                      onClick={() =>
                        download(
                          {
                            action: "download",
                            url,
                            videoHeight: f.height,
                            formatId: f.id,
                            formatHasAudio: f.hasAudio,
                            filename: info.title,
                          },
                          `${info.title} (${formatQualityLabel(f)})`,
                          `${slugify(info.title)}-${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}${
                            f.dynamicRange ? "-hdr" : ""
                          }.mp4`
                        )
                      }
                      className="rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-800 transition hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                      <span className="font-semibold">
                        {f.label}
                        {f.fps && f.fps > 30 ? ` · ${f.fps} fps` : ""}
                        {f.dynamicRange ? ` · ${f.dynamicRange}` : ""}
                      </span>
                      <span className="block text-xs font-normal text-gray-400">
                        {formatDetails(f)}
                      </span>
                    </button>
                  ))}

                  <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:col-span-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="text-xs font-semibold text-emerald-800">
                        Qualité audio
                        <select
                          value={audioQuality}
                          onChange={(e) => setAudioQuality(e.target.value)}
                          disabled={!!downloading}
                          className="input mt-1 !py-2 text-xs sm:mt-0 sm:ml-2 sm:!w-auto"
                        >
                          {AUDIO_QUALITY_OPTIONS.map((q) => (
                            <option key={q.value} value={q.value}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!!downloading}
                        onClick={() =>
                          download(
                            {
                              action: "download",
                              url,
                              audioOnly: true,
                              audioQuality,
                              filename: info.title,
                            },
                            `${info.title} (MP3 ${audioQuality.replace("K", " kbit/s")})`,
                            `${slugify(info.title)}.mp3`
                          )
                        }
                        className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-500 disabled:opacity-50"
                      >
                        🎵 Extraire en MP3
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!!downloading}
                    onClick={() =>
                      download(
                        { action: "download", url, type: "video", quality: "standard", filename: info.title },
                        `${info.title} (sans filigrane)`,
                        `${slugify(info.title)}-no-watermark.mp4`
                      )
                    }
                    className="col-span-2 rounded-lg border border-brand bg-brand/5 px-3 py-3 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50 sm:col-span-1"
                  >
                    Vidéo sans filigrane
                    <span className="block text-xs font-normal text-gray-500">Qualité d'origine</span>
                  </button>

                  <button
                    type="button"
                    disabled={!!downloading || !info.hdAvailable}
                    onClick={() =>
                      download(
                        { action: "download", url, type: "video", quality: "hd", filename: info.title },
                        `${info.title} (HD)`,
                        `${slugify(info.title)}-hd.mp4`
                      )
                    }
                    className="rounded-lg border border-gray-200 px-3 py-3 text-sm font-medium text-gray-800 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Qualité HD
                    <span className="block text-xs font-normal text-gray-400">
                      {info.hdAvailable ? "1080p natif" : "Indisponible"}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!!downloading}
                    onClick={() =>
                      download(
                        { action: "download", url, type: "audio", filename: info.title },
                        `${info.title} (MP3)`,
                        `${slugify(info.title)}.mp3`
                      )
                    }
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700 transition hover:border-emerald-400 disabled:opacity-50"
                  >
                    MP3 · Audio
                    <span className="block text-xs font-normal text-emerald-600">Qualité audio</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MusicPlaylistCard({
  info,
  downloading,
  onDownloadTrack,
  onDownloadZip,
}: {
  info: Extract<InfoData, { platform: "spotify" | "deezer" }>;
  downloading: DownloadState | null;
  onDownloadTrack: (track: MusicTrackData) => void;
  onDownloadZip: () => void;
}) {
  return (
    <div className="card mt-6">
      <div className="flex items-start gap-4">
        {info.playlist.cover && (
          <img
            src={info.playlist.cover}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-snug">{info.playlist.title}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {info.playlist.count} titre{info.playlist.count > 1 ? "s" : ""} ·{" "}
            {info.platform === "spotify" ? "Spotify" : "Deezer"} · MP3
          </p>
          {info.playlist.total && info.playlist.total > info.playlist.count ? (
            <p className="mt-1 text-xs text-amber-600">
              Cette playlist contient {info.playlist.total} titres : les{" "}
              {info.playlist.count} premiers sont affichés.
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={!!downloading}
        onClick={onDownloadZip}
        className="btn-primary mt-4 w-full"
      >
        📦 Télécharger toute la playlist (ZIP MP3)
      </button>
      <p className="mt-2 text-center text-xs text-emerald-600">
        Toute la playlist en un clic, ou téléchargez les titres individuellement ci-dessous.
      </p>

      <ul className="mt-4 max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
        {info.playlist.tracks.map((t, i) => (
          <li key={`${t.id}-${i}`} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 shrink-0 text-center text-xs font-bold text-gray-400">
              {i + 1}
            </span>
            {t.cover && (
              <img
                src={t.cover}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-gray-400">
                {[t.artist, t.duration ? formatDuration(t.duration) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              disabled={!!downloading}
              onClick={() => onDownloadTrack(t)}
              className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⬇ Télécharger
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function trackLabel(track: MusicTrackData): string {
  return `${track.artist ? track.artist + " - " : ""}${track.title}`;
}

function formatQualityLabel(f: {
  label: string;
  fps: number | null;
  dynamicRange: string | null;
  vcodec: string | null;
}): string {
  return [f.label, f.fps && f.fps > 30 ? `${f.fps} fps` : null, f.dynamicRange, f.vcodec]
    .filter(Boolean)
    .join(" · ");
}

function formatDetails(f: {
  tbr: number | null;
  vcodec: string | null;
  filesize: number | null;
}): string {
  const parts: string[] = [];
  if (f.tbr) parts.push(`${Math.round(f.tbr)} kbit/s`);
  if (f.vcodec) parts.push(f.vcodec);
  parts.push("MP4");
  if (f.filesize && f.filesize > 0) parts.push(`~${formatBytes(f.filesize)}`);
  return parts.join(" · ");
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} Go`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} Mo`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "video"
  );
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const extended = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      /* ignore */
    }
  }
  const m = disposition.match(/filename="?([^";]+)"?/i);
  return m?.[1] ?? fallback;
}
