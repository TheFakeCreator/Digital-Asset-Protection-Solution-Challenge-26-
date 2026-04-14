"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Asset,
  Detection,
  DetectionSearchJob,
  fetchAssets,
  fetchDetectionJob,
  fetchDetections,
  triggerDetectionSearch
} from "@/lib/api-client";

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

const JOB_POLL_ATTEMPTS = 60;
const JOB_POLL_INTERVAL_MS = 400;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDateTime(value?: string) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function isImageUrl(value: string) {
  return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(value);
}

function confidenceClass(confidence: number) {
  if (confidence >= 90) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (confidence >= 75) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

function noticeClass(tone: Notice["tone"]) {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "error") {
    return "bg-rose-50 text-rose-700";
  }

  return "bg-sky-50 text-sky-700";
}

function getDetectionAssetName(assetRef: Detection["assetId"]) {
  if (typeof assetRef === "string") {
    return assetRef;
  }

  return assetRef?.name || assetRef?._id || "Unknown asset";
}

function getDetectionAssetId(assetRef: Detection["assetId"]) {
  if (typeof assetRef === "string") {
    return assetRef;
  }

  return assetRef?._id || "";
}

function buildFalsePositiveReportText(detection: Detection) {
  return [
    "False Positive Detection Report",
    `Detection ID: ${detection._id}`,
    `Platform: ${detection.platform}`,
    `Confidence: ${detection.confidence}`,
    `URL: ${detection.url}`,
    `Found At: ${detection.dateFound}`,
    `Asset ID: ${getDetectionAssetId(detection.assetId)}`,
    `Asset Name: ${getDetectionAssetName(detection.assetId)}`,
    "Notes:"
  ].join("\n");
}

export default function DetectionsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isLoadingDetections, setIsLoadingDetections] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [activeJob, setActiveJob] = useState<DetectionSearchJob | null>(null);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reportedDetectionIds, setReportedDetectionIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset._id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const platformOptions = useMemo(() => {
    const unique = new Set(detections.map((detection) => detection.platform));
    return ["all", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [detections]);

  const filteredDetections = useMemo(() => {
    return detections.filter((detection) => {
      if (platformFilter !== "all" && detection.platform !== platformFilter) {
        return false;
      }

      if (detection.confidence < minConfidence) {
        return false;
      }

      const detectedAt = new Date(detection.dateFound);
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        if (detectedAt < from) {
          return false;
        }
      }

      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        if (detectedAt > to) {
          return false;
        }
      }

      return true;
    });
  }, [detections, platformFilter, minConfidence, fromDate, toDate]);

  const detectionTimeline = useMemo(() => {
    return [...filteredDetections].sort((left, right) => {
      return new Date(right.dateFound).getTime() - new Date(left.dateFound).getTime();
    });
  }, [filteredDetections]);

  const dashboardStats = useMemo(() => {
    const platforms = new Set(detections.map((detection) => detection.platform).filter(Boolean));
    const totalConfidence = detections.reduce((sum, detection) => sum + detection.confidence, 0);
    const averageConfidence = detections.length > 0 ? Math.round(totalConfidence / detections.length) : 0;
    const confirmedCount = detections.filter((detection) => detection.status === "confirmed").length;

    return {
      totalAssets: assets.length,
      totalDetections: detections.length,
      platformsMonitored: platforms.size,
      averageConfidence,
      confirmedCount
    };
  }, [assets.length, detections]);

  async function loadAssets() {
    setIsLoadingAssets(true);
    try {
      const response = await fetchAssets(1, 100);
      setAssets(response.items);
      setSelectedAssetId((previous) => previous || response.items[0]?._id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load assets";
      setNotice({ tone: "error", message });
    } finally {
      setIsLoadingAssets(false);
    }
  }

  async function loadDetections(assetId: string) {
    if (!assetId) {
      setDetections([]);
      return;
    }

    setIsLoadingDetections(true);
    try {
      const response = await fetchDetections(assetId, 1, 100);
      setDetections(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load detections";
      setNotice({ tone: "error", message });
    } finally {
      setIsLoadingDetections(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (selectedAssetId) {
      loadDetections(selectedAssetId);
    }
  }, [selectedAssetId]);

  async function handleReportFalsePositive(detection: Detection) {
    const reportText = buildFalsePositiveReportText(detection);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText);
      }

      setReportedDetectionIds((previous) => ({
        ...previous,
        [detection._id]: true
      }));

      setNotice({
        tone: "info",
        message: "False-positive report prepared and copied to clipboard for triage."
      });
    } catch {
      setReportedDetectionIds((previous) => ({
        ...previous,
        [detection._id]: true
      }));

      setNotice({
        tone: "info",
        message: "False-positive report marked for triage (clipboard unavailable in this browser)."
      });
    }
  }

  async function handleTriggerDetectionRun() {
    if (!selectedAssetId) {
      setNotice({ tone: "error", message: "Select an asset before triggering detection." });
      return;
    }

    setIsTriggering(true);
    setNotice(null);

    try {
      const queued = await triggerDetectionSearch(selectedAssetId);
      let job = queued.job;
      setActiveJob(job);

      for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
        if (job.status === "completed" || job.status === "failed") {
          break;
        }

        await wait(JOB_POLL_INTERVAL_MS);
        job = await fetchDetectionJob(job.id);
        setActiveJob(job);
      }

      if (job.status === "completed") {
        await loadDetections(selectedAssetId);
        setNotice({
          tone: "success",
          message: `Detection run completed. ${job.createdDetections} detections created.`
        });
      } else if (job.status === "failed") {
        setNotice({
          tone: "error",
          message: `Detection run failed${job.error ? `: ${job.error}` : ""}`
        });
      } else {
        setNotice({
          tone: "info",
          message: "Detection run is still processing. Refresh job status shortly."
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to trigger detection run";
      setNotice({ tone: "error", message });
    } finally {
      setIsTriggering(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12 sm:px-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Detection Results</p>
        <h1 className="text-3xl font-bold text-slate-900">Unauthorized Usage Monitoring</h1>
        <p className="text-slate-600">
          Trigger detection runs per asset and review filtered confidence-scored matches.
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Asset</span>
            <select
              value={selectedAssetId}
              onChange={(event) => setSelectedAssetId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Select asset</option>
              {assets.map((asset) => (
                <option key={asset._id} value={asset._id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Asset Metadata</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {selectedAsset ? (
                <>
                  <p>{selectedAsset.creator}</p>
                  <p className="text-xs">Event date: {new Date(selectedAsset.eventDate).toLocaleDateString()}</p>
                </>
              ) : (
                <p>Select an asset to load detections.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isTriggering || !selectedAssetId || isLoadingAssets}
            onClick={handleTriggerDetectionRun}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isTriggering ? "Running Detection..." : "Trigger Detection Run"}
          </button>
          <button
            type="button"
            onClick={() => loadDetections(selectedAssetId)}
            disabled={!selectedAssetId || isLoadingDetections}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh Detections
          </button>
        </div>
      </section>

      {activeJob ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detection Job</p>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <span className="font-semibold">Status:</span> {activeJob.status}
            </p>
            <p>
              <span className="font-semibold">Created:</span> {formatDateTime(activeJob.createdAt)}
            </p>
            <p>
              <span className="font-semibold">Completed:</span> {formatDateTime(activeJob.completedAt || "")}
            </p>
            <p>
              <span className="font-semibold">Detections:</span> {activeJob.createdDetections}
            </p>
          </div>
          {activeJob.error ? (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{activeJob.error}</p>
          ) : null}
        </section>
      ) : null}

      {notice ? <p className={`rounded-lg px-3 py-2 text-sm ${noticeClass(notice.tone)}`}>{notice.message}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">Platform</span>
            <select
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              {platformOptions.map((platform) => (
                <option key={platform} value={platform}>
                  {platform === "all" ? "All platforms" : platform}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Min Confidence</span>
            <input
              type="number"
              min={0}
              max={100}
              value={minConfidence}
              onChange={(event) => setMinConfidence(Number(event.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">From Date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">To Date</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setPlatformFilter("all");
              setMinConfidence(0);
              setFromDate("");
              setToDate("");
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assets Loaded</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.totalAssets}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Detections</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.totalDetections}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Platforms Monitored</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.platformsMonitored}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average Confidence</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.averageConfidence}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 xl:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmed</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dashboardStats.confirmedCount}</p>
        </article>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Detection Timeline</h2>
          <p className="text-sm text-slate-600">{detectionTimeline.length} events</p>
        </div>

        {detectionTimeline.length === 0 ? (
          <p className="text-sm text-slate-600">No timeline events for the current filters.</p>
        ) : (
          <ol className="space-y-3">
            {detectionTimeline.map((detection) => (
              <li key={`timeline-${detection._id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold uppercase text-slate-700">
                    {detection.platform}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${confidenceClass(detection.confidence)}`}>
                    Confidence {detection.confidence}
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(detection.dateFound)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {getDetectionAssetName(detection.assetId)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Detections</h2>
          <p className="text-sm text-slate-600">
            {isLoadingDetections ? "Loading..." : `${filteredDetections.length} shown / ${detections.length} total`}
          </p>
        </div>

        {isLoadingDetections ? (
          <p className="text-sm text-slate-600">Loading detections...</p>
        ) : filteredDetections.length === 0 ? (
          <p className="text-sm text-slate-600">
            No detections match the current filters for this asset.
          </p>
        ) : (
          <ul className="grid gap-4">
            {filteredDetections.map((detection) => (
              <li key={detection._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {isImageUrl(detection.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detection.url}
                        alt="Detected media"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="px-4 text-center text-xs text-slate-500">
                        Image preview unavailable for this source URL.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold uppercase text-slate-700">
                        {detection.platform}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${confidenceClass(
                          detection.confidence
                        )}`}
                      >
                        Confidence {detection.confidence}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900">
                      Asset: {getDetectionAssetName(detection.assetId)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Asset ID: {getDetectionAssetId(detection.assetId)} • Found: {formatDateTime(detection.dateFound)}
                    </p>

                    <a
                      href={detection.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      Open Source URL
                    </a>

                    <button
                      type="button"
                      onClick={() => handleReportFalsePositive(detection)}
                      disabled={Boolean(reportedDetectionIds[detection._id])}
                      className="ml-2 inline-flex rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reportedDetectionIds[detection._id] ? "Reported" : "Report False Positive"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
