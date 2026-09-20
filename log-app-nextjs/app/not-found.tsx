import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center gap-3 bg-graphite px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-chalk">Page not found</h1>
      <p className="font-mono text-sm text-chalkDim">That route doesn&apos;t exist.</p>
      <Link
        href="/today"
        className="mt-2 rounded-card bg-rust px-5 py-3 font-mono text-sm font-medium text-white"
      >
        Go to Today
      </Link>
    </div>
  );
}
