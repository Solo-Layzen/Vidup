import clsx from "clsx";

export default function ProgressBar({
  progress,
  received,
  total,
  label,
}: {
  progress: number | null;
  received: number;
  total: number;
  label: string;
}) {
  const pct = progress ?? 0;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-500">
          {progress === null ? (
            `${formatBytes(received)} reçus`
          ) : (
            <>{Math.round(pct)}% ({formatBytes(received)} / {formatBytes(total)})</>
          )}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={clsx(
            "h-full rounded-full bg-brand transition-all duration-150",
            progress === null && "animate-pulse"
          )}
          style={{ width: progress === null ? "100%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
