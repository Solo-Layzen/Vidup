import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { NextResponse } from "next/server";
import { runYtdlp } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check utilisé par Render (et par vous) pour vérifier que le serveur
 * Node est bien en ligne ET que ses deux binaires indispensables répondent.
 * Le résultat est mis en cache : un health check toutes les 30 s ne doit pas
 * relancer deux processus à chaque fois.
 */
const CACHE_TTL_MS = 60_000;

type HealthPayload = {
  ok: boolean;
  service: string;
  uptime: number;
  tools: {
    ytdlp: string | null;
    ffmpeg: string | null;
  };
  error?: string;
};

let cached: { time: number; payload: HealthPayload; status: number } | null = null;

function ffmpegBinary(): string {
  const raw = process.env.FFMPEG_PATH?.trim();
  if (!raw) return "ffmpeg";
  // Chemin complet vers ffmpeg(.exe) → tel quel.
  if (/[\\/](?:ffmpeg|ffprobe)(?:\.exe)?$/i.test(raw)) return raw;
  // Dossier → binaire à l'intérieur, sinon on retombe sur le PATH.
  const candidate = path.join(raw, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return existsSync(candidate) ? candidate : "ffmpeg";
}

function ffmpegVersion(): Promise<string | null> {
  const bin = ffmpegBinary();
  return new Promise((resolve) => {
    let out = "";
    let stderr = "";
    let child;
    try {
      child = spawn(bin, ["-version"], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const first = (out || stderr).split("\n")[0]?.trim() ?? "";
      // "ffmpeg version 7.1 Copyright (c) ..." → "7.1"
      const match = first.match(/version\s+([^\s]+)/i);
      resolve(match?.[1] ?? first.slice(0, 40) ?? null);
    });
  });
}

async function getYtdlpVersion(): Promise<string | null> {
  const { stdout, stderr, code } = await runYtdlp(["--version"]);
  if (code !== 0) return null;
  const first = (stdout || stderr).split("\n")[0]?.trim() ?? "";
  return first || null;
}

export async function GET() {
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      status: cached.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const [ytdlp, ffmpeg] = await Promise.all([
    getYtdlpVersion(),
    ffmpegVersion(),
  ]);

  const ok = Boolean(ytdlp && ffmpeg);
  const payload: HealthPayload = {
    ok,
    service: "vidup-api",
    uptime: Math.round(process.uptime()),
    tools: { ytdlp, ffmpeg },
    ...(ok
      ? {}
      : {
          error:
            "yt-dlp ou ffmpeg est introuvable sur le serveur. " +
            "Sur Render, utilisez le Dockerfile fourni (il les installe automatiquement).",
        }),
  };

  const status = ok ? 200 : 503;
  cached = { time: Date.now(), payload, status };
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
