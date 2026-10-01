"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-rose-900/60 bg-[#161b24] p-6">
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-zinc-400">{error.message || "Check that the database is running, then try again."}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-md bg-teal-900 px-3 py-2 text-sm text-white">
        Try again
      </button>
    </div>
  );
}
