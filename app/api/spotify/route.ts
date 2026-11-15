import type { NextRequest } from "next/server";
import { handleMusicRoute } from "@/lib/music-route";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  return handleMusicRoute(req, "spotify");
}