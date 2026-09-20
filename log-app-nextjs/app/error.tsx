'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center gap-3 bg-graphite px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-chalk">Something went wrong</h1>
      <p className="font-mono text-sm text-chalkDim">
        An unexpected error occurred. Nothing you logged was lost.
      </p>
      {process.env.NODE_ENV !== 'production' && error.message && (
        <p className="font-mono text-xs text-steel">{error.message}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-card bg-rust px-5 py-3 font-mono text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
