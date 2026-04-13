import Link from "next/link";
import { fetchAssets, fetchHealth } from "@/lib/api-client";

async function getDashboardSnapshot() {
  try {
    const [health, assets] = await Promise.all([fetchHealth(), fetchAssets(1, 5)]);
    return {
      apiOnline: true,
      health,
      totalAssets: assets.total,
      recentAssets: assets.items.slice(0, 3).map((asset) => asset.name),
      errorMessage: ""
    };
  } catch (error) {
    return {
      apiOnline: false,
      health: null,
      totalAssets: 0,
      recentAssets: [] as string[],
      errorMessage: error instanceof Error ? error.message : "Backend unavailable"
    };
  }
}

export default async function Home() {
  const snapshot = await getDashboardSnapshot();

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
            Day 1 frontend scaffold with a reusable API client and navigation. Use the pages below to continue upload and detection workflows.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Backend Status</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {snapshot.apiOnline ? "Online" : "Offline"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {snapshot.apiOnline
                ? `Uptime: ${snapshot.health?.uptimeSeconds ?? 0}s`
                : snapshot.errorMessage}
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registered Assets</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.totalAssets}</p>
            <p className="mt-1 text-sm text-slate-600">
              {snapshot.recentAssets.length > 0
                ? `Recent: ${snapshot.recentAssets.join(", ")}`
                : "No assets yet. Upload your first media file."}
            </p>
          </article>
        </section>

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
