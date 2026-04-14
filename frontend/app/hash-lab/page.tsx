"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DetectionPreviewCompareResponse,
  previewDetectionCompare
} from "@/lib/api-client";

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

type EditSettings = {
  cropPercent: number;
  rotateDeg: number;
  brightness: number;
  contrast: number;
  addTextOverlay: boolean;
  overlayText: string;
  addBannerOverlay: boolean;
};

type CandidateBuild = {
  file: File;
  previewUrl: string;
  appliedEdits: string[];
};

const DEFAULT_SETTINGS: EditSettings = {
  cropPercent: 0,
  rotateDeg: 0,
  brightness: 100,
  contrast: 100,
  addTextOverlay: false,
  overlayText: "LIVE",
  addBannerOverlay: false
};

function noticeClass(tone: Notice["tone"]) {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "error") {
    return "bg-rose-50 text-rose-700";
  }

  return "bg-sky-50 text-sky-700";
}

function truncateHash(hash: string) {
  if (!hash) {
    return "N/A";
  }

  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load selected image"));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to generate transformed image"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

async function buildCandidateImage(sourceFile: File, settings: EditSettings): Promise<CandidateBuild> {
  const sourceUrl = URL.createObjectURL(sourceFile);
  const appliedEdits: string[] = [];

  try {
    const image = await loadImage(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = width;
    baseCanvas.height = height;
    const baseCtx = baseCanvas.getContext("2d");

    if (!baseCtx) {
      throw new Error("Unable to initialize image canvas");
    }

    baseCtx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;

    const cropPercent = clamp(settings.cropPercent, 0, 40);
    if (cropPercent > 0) {
      const cropX = (width * cropPercent) / 200;
      const cropY = (height * cropPercent) / 200;
      const cropWidth = width - cropX * 2;
      const cropHeight = height - cropY * 2;

      baseCtx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
      appliedEdits.push(`Center crop ${cropPercent}%`);
    } else {
      baseCtx.drawImage(image, 0, 0, width, height);
    }

    let finalCanvas = baseCanvas;

    if (settings.rotateDeg !== 0) {
      const rotatedCanvas = document.createElement("canvas");
      rotatedCanvas.width = width;
      rotatedCanvas.height = height;
      const rotatedCtx = rotatedCanvas.getContext("2d");

      if (!rotatedCtx) {
        throw new Error("Unable to initialize rotation canvas");
      }

      rotatedCtx.translate(width / 2, height / 2);
      rotatedCtx.rotate((settings.rotateDeg * Math.PI) / 180);
      rotatedCtx.drawImage(baseCanvas, -width / 2, -height / 2, width, height);
      finalCanvas = rotatedCanvas;
      appliedEdits.push(`Rotate ${settings.rotateDeg} deg`);
    }

    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx) {
      throw new Error("Unable to finalize transformed image");
    }

    if (settings.brightness !== 100) {
      appliedEdits.push(`Brightness ${settings.brightness}%`);
    }

    if (settings.contrast !== 100) {
      appliedEdits.push(`Contrast ${settings.contrast}%`);
    }

    if (settings.addBannerOverlay) {
      const barHeight = Math.max(18, Math.floor(height * 0.1));
      finalCtx.fillStyle = "rgba(220, 38, 38, 0.4)";
      finalCtx.fillRect(0, height - barHeight, width, barHeight);
      finalCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
      finalCtx.font = `bold ${Math.max(14, Math.floor(height * 0.04))}px sans-serif`;
      finalCtx.fillText("HIGHLIGHT", 12, height - Math.floor(barHeight / 2));
      appliedEdits.push("Banner overlay");
    }

    if (settings.addTextOverlay && settings.overlayText.trim()) {
      finalCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
      finalCtx.fillRect(8, 8, Math.max(120, Math.floor(width * 0.28)), Math.max(28, Math.floor(height * 0.12)));
      finalCtx.fillStyle = "rgba(248, 250, 252, 0.95)";
      finalCtx.font = `bold ${Math.max(16, Math.floor(height * 0.05))}px sans-serif`;
      finalCtx.fillText(settings.overlayText.trim(), 16, Math.max(30, Math.floor(height * 0.085)));
      appliedEdits.push(`Text overlay: ${settings.overlayText.trim()}`);
    }

    if (appliedEdits.length === 0) {
      appliedEdits.push("No edits (exact copy)");
    }

    const blob = await toBlob(finalCanvas);
    const previewUrl = URL.createObjectURL(blob);
    const file = new File([blob], `candidate-${Date.now()}.png`, { type: "image/png" });

    return {
      file,
      previewUrl,
      appliedEdits
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function HashLabPage() {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [candidatePreviewUrl, setCandidatePreviewUrl] = useState("");
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [appliedEdits, setAppliedEdits] = useState<string[]>([]);
  const [settings, setSettings] = useState<EditSettings>(DEFAULT_SETTINGS);
  const [threshold, setThreshold] = useState(85);
  const [isBuildingCandidate, setIsBuildingCandidate] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<DetectionPreviewCompareResponse | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const referencePreviewUrl = useMemo(() => {
    if (!referenceFile) {
      return "";
    }

    return URL.createObjectURL(referenceFile);
  }, [referenceFile]);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    return () => {
      if (candidatePreviewUrl) {
        URL.revokeObjectURL(candidatePreviewUrl);
      }
    };
  }, [candidatePreviewUrl]);

  useEffect(() => {
    let cancelled = false;

    async function regenerate() {
      if (!referenceFile) {
        setCandidateFile(null);
        setAppliedEdits([]);
        setCompareResult(null);
        setNotice(null);
        setCandidatePreviewUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return "";
        });
        return;
      }

      setIsBuildingCandidate(true);

      try {
        const built = await buildCandidateImage(referenceFile, settings);
        if (cancelled) {
          URL.revokeObjectURL(built.previewUrl);
          return;
        }

        setCandidateFile(built.file);
        setAppliedEdits(built.appliedEdits);
        setCandidatePreviewUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }

          return built.previewUrl;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to generate edited preview";
        if (!cancelled) {
          setNotice({ tone: "error", message });
        }
      } finally {
        if (!cancelled) {
          setIsBuildingCandidate(false);
        }
      }
    }

    regenerate();

    return () => {
      cancelled = true;
    };
  }, [referenceFile, settings]);

  async function handleCompare() {
    if (!referenceFile || !candidateFile) {
      setNotice({ tone: "error", message: "Upload a reference image first." });
      return;
    }

    setIsComparing(true);
    setNotice(null);

    try {
      const response = await previewDetectionCompare(referenceFile, candidateFile, threshold);
      setCompareResult(response);

      const result = response.comparison.result;
      if (result?.status === "ok" && result.is_match) {
        setNotice({
          tone: "success",
          message: `Tracked successfully with similarity ${result.similarity_score} at threshold ${response.comparison.threshold}.`
        });
      } else {
        setNotice({
          tone: "info",
          message: "Comparison completed. Current edit profile is below match threshold."
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Comparison failed";
      setNotice({ tone: "error", message });
    } finally {
      setIsComparing(false);
    }
  }

  function handleResetEdits() {
    setSettings(DEFAULT_SETTINGS);
    setCompareResult(null);
    setNotice({ tone: "info", message: "Edits reset. Candidate regenerated from reference." });
  }

  const similarityScore = compareResult?.comparison.result?.similarity_score || 0;
  const isMatch = Boolean(compareResult?.comparison.result?.is_match);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12 sm:px-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Hash Tracking Lab</p>
        <h1 className="text-3xl font-bold text-slate-900">Visual Edit-Robust Tracking Demo</h1>
        <p className="text-slate-600">
          Upload one source image, apply edits like crop/rotate/text overlays, then run a live tracking check to show hash-linked detection resilience.
        </p>
      </header>

      <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Reference Image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setReferenceFile(file);
                setCompareResult(null);
                setNotice(null);
              }}
              className="w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Crop (%)</span>
              <input
                type="range"
                min={0}
                max={25}
                value={settings.cropPercent}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    cropPercent: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.cropPercent}%</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rotate (deg)</span>
              <input
                type="range"
                min={-12}
                max={12}
                value={settings.rotateDeg}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    rotateDeg: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.rotateDeg} deg</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brightness</span>
              <input
                type="range"
                min={80}
                max={130}
                value={settings.brightness}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    brightness: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.brightness}%</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contrast</span>
              <input
                type="range"
                min={80}
                max={130}
                value={settings.contrast}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    contrast: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.contrast}%</p>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.addTextOverlay}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    addTextOverlay: event.target.checked
                  }))
                }
              />
              Add Text Overlay
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.addBannerOverlay}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    addBannerOverlay: event.target.checked
                  }))
                }
              />
              Add Banner Overlay
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overlay Text</span>
            <input
              type="text"
              value={settings.overlayText}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  overlayText: event.target.value
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match Threshold</span>
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(event) => setThreshold(clamp(Number(event.target.value) || 0, 0, 100))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <button
              type="button"
              onClick={handleResetEdits}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Reset Edits
            </button>

            <button
              type="button"
              onClick={handleCompare}
              disabled={!referenceFile || !candidateFile || isBuildingCandidate || isComparing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isComparing ? "Checking..." : "Run Tracking Check"}
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference</p>
            <div className="mt-2 flex h-52 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {referencePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={referencePreviewUrl} alt="Reference preview" className="h-full w-full object-contain" />
              ) : (
                <p className="px-3 text-center text-sm text-slate-500">Upload an image to start.</p>
              )}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Edited Candidate</p>
            <div className="mt-2 flex h-52 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {candidatePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={candidatePreviewUrl} alt="Candidate preview" className="h-full w-full object-contain" />
              ) : (
                <p className="px-3 text-center text-sm text-slate-500">
                  {isBuildingCandidate ? "Generating candidate..." : "Candidate preview will appear here."}
                </p>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Applied Edit Profile</h2>
        {appliedEdits.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No edits yet. Upload a reference image first.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {appliedEdits.map((edit) => (
              <li key={edit} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {edit}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Hash Tracking Result</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              isMatch ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {compareResult ? (isMatch ? "Tracked" : "Below Threshold") : "Awaiting Check"}
          </span>
        </div>

        {compareResult ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Fingerprint</p>
              <p className="mt-2 font-mono text-sm text-slate-800">{truncateHash(compareResult.reference.hash)}</p>
              <p className="mt-1 text-xs text-slate-500">{compareResult.reference.algorithm}</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate Fingerprint</p>
              <p className="mt-2 font-mono text-sm text-slate-800">{truncateHash(compareResult.candidate.hash)}</p>
              <p className="mt-1 text-xs text-slate-500">{compareResult.candidate.algorithm}</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Similarity Score</p>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full ${isMatch ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(100, Math.max(0, similarityScore))}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                Score {similarityScore} / Threshold {compareResult.comparison.threshold}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Detection algorithm: {compareResult.comparison.algorithm} • Match variant: {compareResult.comparison.result?.match_variant || "N/A"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Reference variants tested: {compareResult.comparison.referenceVariants.join(", ") || "N/A"}
              </p>
            </article>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Run a tracking check to see whether the edited image is still linked to the uploaded source hash profile.
          </p>
        )}
      </section>

      {notice ? <p className={`rounded-lg px-3 py-2 text-sm ${noticeClass(notice.tone)}`}>{notice.message}</p> : null}
    </main>
  );
}
