import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 bg-slate-50">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12 sm:px-10">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Solution Challenge 2026
          </p>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Digital Asset Protection Dashboard
          </h1>
          <p className="max-w-2xl text-slate-600">
            Day 1 frontend scaffold. Use the pages below to start implementing upload and detection workflows.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/upload"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <h2 className="text-xl font-semibold text-slate-900">Upload</h2>
            <p className="mt-2 text-sm text-slate-600">
              Register official sports media and metadata for fingerprint generation.
            </p>
          </Link>

          <Link
            href="/detections"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <h2 className="text-xl font-semibold text-slate-900">Detections</h2>
            <p className="mt-2 text-sm text-slate-600">
              View detection runs, confidence scores, and unauthorized usage results.
            </p>
          </Link>
        </section>
      </main>
    </div>
  );
}
