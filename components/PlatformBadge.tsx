import type { Platform } from "@/lib/platform";

export default function PlatformBadge({ platform }: { platform: Platform }) {
  if (platform === "youtube") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
        YouTube
      </span>
    );
  }
  if (platform === "tiktok") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        TikTok
      </span>
    );
  }
  if (platform === "spotify") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
        Spotify
      </span>
    );
  }
  if (platform === "deezer") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
        Deezer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
      Lien non reconnu
    </span>
  );
}