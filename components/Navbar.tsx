import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          Vid<span className="text-brand">Up</span>
        </Link>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Link href="/faq/" className="font-medium hover:text-brand">
            FAQ
          </Link>
          <span className="hidden text-gray-300 sm:inline">·</span>
          <span className="hidden sm:inline">Gratuit</span>
          <span className="hidden text-gray-300 sm:inline">·</span>
          <span className="hidden sm:inline">Sans limite</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:hidden">
            100 % gratuit
          </span>
        </div>
      </nav>
    </header>
  );
}
