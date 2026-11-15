import type { NextRequest } from "next/server";
import { getClientIp } from "./utils";

/**
 * Rate limiting technique (en mémoire, 20 req/min/IP).
 * Limite : ne fonctionne qu'en mono-instance.
 * Pour un déploiement multi-instances, remplacer par Redis
 * (rate-limiter-flexible, upstash, etc.).
 */

const hits = new Map<string, number[]>();

export function rateLimit(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (arr.length >= max) {
    hits.set(ip, arr);
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    return { allowed: false as const, retryAfter };
  }

  arr.push(now);
  hits.set(ip, arr);

  if (hits.size > 10_000) {
    for (const [key, ts] of hits) {
      if (ts.length === 0 || now - ts[ts.length - 1] > windowMs) hits.delete(key);
    }
  }

  return { allowed: true as const, retryAfter: 0 };
}

/** Retourne une réponse d'erreur si le rate limit est dépassé, sinon null. */
export function checkRateLimit(req: NextRequest, max?: number): Response | null {
  const ip = getClientIp(req);
  const res = rateLimit(ip, max);
  if (res.allowed) return null;
  return Response.json(
    {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Trop de requêtes. Réessayez dans quelques secondes.",
      },
    },
    { status: 429, headers: { "Retry-After": String(res.retryAfter) } }
  );
}
