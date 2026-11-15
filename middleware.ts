import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS pour les déploiements « front statique + API distante » (InfinityFree,
 * Netlify…) : l'interface peut ainsi appeler l'API Node depuis un autre domaine.
 * Aucun cookie n'est utilisé → `*` est sans risque.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length",
  "Access-Control-Max-Age": "86400",
};

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
