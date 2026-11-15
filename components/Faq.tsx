import Link from "next/link";
import { FAQ } from "@/lib/faq";

export default function Faq({ limit }: { limit?: number }) {
  const items = typeof limit === "number" ? FAQ.slice(0, limit) : FAQ;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.question}
          className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition open:border-brand/40 open:shadow-md"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-gray-800 [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <span
              aria-hidden
              className="mt-0.5 shrink-0 text-lg leading-none text-brand transition group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{item.answer}</p>
        </details>
      ))}

      {typeof limit === "number" && FAQ.length > limit && (
        <p className="pt-1 text-center text-sm">
          <Link href="/faq/" className="font-semibold text-brand hover:underline">
            Voir toutes les questions ({FAQ.length}) →
          </Link>
        </p>
      )}
    </div>
  );
}
