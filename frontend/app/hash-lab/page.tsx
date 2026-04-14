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
  saturation: number;
  blurPx: number;
  noisePercent: number;
  downscalePercent: number;
  jpegQuality: number;
  addTextOverlay: boolean;
  overlayText: string;
  addBannerOverlay: boolean;
};

type CandidateBuild = {
  file: File;
  previewUrl: string;
  appliedEdits: string[];
};

type BenchmarkCase = {
  id: string;
  label: string;
  hardness: number;
  settings: EditSettings;
};

type BenchmarkResult = {
  id: string;
  label: string;
  hardness: number;
  edits: string[];
  finalScore: number | null;
  hashScore: number | null;
  geometricScore: number | null;
  method: string;
  watermarkConfidence: number | null;
  watermarkBer: number | null;
  isMatch: boolean | null;
  error?: string;
};

type NoiseSignal = {
  id: string;
  label: string;
  detail: string;
  intensity: number;
};

const DEFAULT_WATERMARK_KEY = "hash-lab-demo-key";

const EDIT_LIMITS = {
  cropMax: 45,
  rotateMax: 35,
  brightnessMin: 50,
  brightnessMax: 170,
  contrastMin: 50,
  contrastMax: 170,
  saturationMin: 40,
  saturationMax: 170,
  blurMax: 6,
  noiseMax: 35,
  downscaleMin: 35,
  downscaleMax: 100,
  jpegQualityMin: 25,
  jpegQualityMax: 100
} as const;

const DEFAULT_SETTINGS: EditSettings = {
  cropPercent: 0,
  rotateDeg: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blurPx: 0,
  noisePercent: 0,
  downscalePercent: 100,
  jpegQuality: 100,
  addTextOverlay: false,
  overlayText: "LIVE",
  addBannerOverlay: false
};

const PRESET_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "exact",
    label: "Exact Copy",
    hardness: 0,
    settings: { ...DEFAULT_SETTINGS }
  },
  {
    id: "light-tone",
    label: "Tone Shift",
    hardness: 12,
    settings: { ...DEFAULT_SETTINGS, brightness: 108, contrast: 104, saturation: 110 }
  },
  {
    id: "jpeg-light",
    label: "JPEG 85 + Downscale 90%",
    hardness: 20,
    settings: { ...DEFAULT_SETTINGS, jpegQuality: 85, downscalePercent: 90 }
  },
  {
    id: "crop-12",
    label: "Crop 12%",
    hardness: 28,
    settings: { ...DEFAULT_SETTINGS, cropPercent: 12 }
  },
  {
    id: "rotate-12",
    label: "Rotate 12 deg",
    hardness: 36,
    settings: { ...DEFAULT_SETTINGS, rotateDeg: 12 }
  },
  {
    id: "text-overlay",
    label: "Text Overlay",
    hardness: 44,
    settings: { ...DEFAULT_SETTINGS, addTextOverlay: true, overlayText: "LIVE" }
  },
  {
    id: "banner-overlay",
    label: "Banner Overlay",
    hardness: 50,
    settings: { ...DEFAULT_SETTINGS, addBannerOverlay: true }
  },
  {
    id: "blur-noise",
    label: "Blur 2 + Noise 8%",
    hardness: 58,
    settings: { ...DEFAULT_SETTINGS, blurPx: 2, noisePercent: 8 }
  },
  {
    id: "crop-rotate",
    label: "Crop 22% + Rotate 18 deg",
    hardness: 68,
    settings: { ...DEFAULT_SETTINGS, cropPercent: 22, rotateDeg: 18 }
  },
  {
    id: "lowres-jpeg",
    label: "Downscale 55% + JPEG 55",
    hardness: 76,
    settings: { ...DEFAULT_SETTINGS, downscalePercent: 55, jpegQuality: 55, noisePercent: 12 }
  },
  {
    id: "hard-combo",
    label: "Hard Combo",
    hardness: 88,
    settings: {
      ...DEFAULT_SETTINGS,
      cropPercent: 28,
      rotateDeg: -22,
      blurPx: 3,
      noisePercent: 18,
      downscalePercent: 60,
      jpegQuality: 50,
      brightness: 115,
      contrast: 130,
      saturation: 72,
      addTextOverlay: true,
      overlayText: "STREAM",
      addBannerOverlay: true
    }
  },
  {
    id: "extreme-attack",
    label: "Extreme Attack",
    hardness: 98,
    settings: {
      ...DEFAULT_SETTINGS,
      cropPercent: 40,
      rotateDeg: 30,
      blurPx: 4.5,
      noisePercent: 26,
      downscalePercent: 45,
      jpegQuality: 35,
      brightness: 62,
      contrast: 150,
      saturation: 58,
      addTextOverlay: true,
      overlayText: "REUPLOAD",
      addBannerOverlay: true
    }
  }
];

const HASH_EXPLANATION_WEIGHTS = [
  { id: "phash", label: "pHash", weightPercent: 40, description: "Global perceptual structure" },
  { id: "dhash", label: "dHash", weightPercent: 25, description: "Gradient transitions" },
  { id: "whash", label: "wHash", weightPercent: 20, description: "Wavelet texture cues" },
  { id: "ahash", label: "aHash", weightPercent: 15, description: "Average luminance pattern" }
] as const;

function getNoiseSignals(settings: EditSettings): NoiseSignal[] {
  const textEnabled = settings.addTextOverlay && Boolean(settings.overlayText.trim());

  return [
    {
      id: "crop",
      label: "Cropping",
      detail: `${settings.cropPercent}% center crop`,
      intensity: clamp(settings.cropPercent / EDIT_LIMITS.cropMax, 0, 1)
    },
    {
      id: "rotate",
      label: "Rotation",
      detail: `${settings.rotateDeg} deg`,
      intensity: clamp(Math.abs(settings.rotateDeg) / EDIT_LIMITS.rotateMax, 0, 1)
    },
    {
      id: "brightness",
      label: "Brightness Shift",
      detail: `${settings.brightness}%`,
      intensity: clamp(Math.abs(settings.brightness - 100) / (EDIT_LIMITS.brightnessMax - 100), 0, 1)
    },
    {
      id: "contrast",
      label: "Contrast Shift",
      detail: `${settings.contrast}%`,
      intensity: clamp(Math.abs(settings.contrast - 100) / (EDIT_LIMITS.contrastMax - 100), 0, 1)
    },
    {
      id: "saturation",
      label: "Saturation Shift",
      detail: `${settings.saturation}%`,
      intensity: clamp(Math.abs(settings.saturation - 100) / (EDIT_LIMITS.saturationMax - 100), 0, 1)
    },
    {
      id: "blur",
      label: "Blur",
      detail: `${settings.blurPx.toFixed(1)} px`,
      intensity: clamp(settings.blurPx / EDIT_LIMITS.blurMax, 0, 1)
    },
    {
      id: "noise",
      label: "Pixel Noise",
      detail: `${settings.noisePercent}%`,
      intensity: clamp(settings.noisePercent / EDIT_LIMITS.noiseMax, 0, 1)
    },
    {
      id: "resolution",
      label: "Resolution Loss",
      detail: `Downscale ${settings.downscalePercent}%`,
      intensity: clamp((100 - settings.downscalePercent) / (100 - EDIT_LIMITS.downscaleMin), 0, 1)
    },
    {
      id: "jpeg",
      label: "JPEG Compression",
      detail: settings.jpegQuality < 100 ? `Q${settings.jpegQuality}` : "disabled",
      intensity: settings.jpegQuality < 100
        ? clamp((100 - settings.jpegQuality) / (100 - EDIT_LIMITS.jpegQualityMin), 0, 1)
        : 0
    },
    {
      id: "text",
      label: "Text Overlay",
      detail: textEnabled ? settings.overlayText.trim() : "disabled",
      intensity: textEnabled ? 0.65 : 0
    },
    {
      id: "banner",
      label: "Banner Overlay",
      detail: settings.addBannerOverlay ? "enabled" : "disabled",
      intensity: settings.addBannerOverlay ? 0.55 : 0
    }
  ];
}

function getNoiseSeverityLabel(score: number) {
  if (score < 15) {
    return "Very Low";
  }

  if (score < 35) {
    return "Low";
  }

  if (score < 60) {
    return "Medium";
  }

  if (score < 80) {
    return "High";
  }

  return "Very High";
}

function hexBitDistance(referenceHex: string, candidateHex: string) {
  const ref = (referenceHex || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  const cand = (candidateHex || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  const comparedLength = Math.min(ref.length, cand.length);

  if (comparedLength === 0) {
    return 0;
  }

  let distance = 0;
  for (let index = 0; index < comparedLength; index += 1) {
    const left = Number.parseInt(ref[index], 16);
    const right = Number.parseInt(cand[index], 16);
    const xor = left ^ right;
    distance += xor.toString(2).split("0").join("").length;
  }

  return distance;
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

function formatMetric(value: number | null | undefined, precision = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return value.toFixed(precision);
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load selected image"));
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, mimeType = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to generate transformed image"));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

async function buildCandidateImage(sourceFile: File, settings: EditSettings): Promise<CandidateBuild> {
  const sourceUrl = URL.createObjectURL(sourceFile);
  const appliedEdits: string[] = [];

  try {
    const image = await loadImage(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const normalizedOverlayText = settings.overlayText.trim();
    const cropPercent = clamp(settings.cropPercent, 0, EDIT_LIMITS.cropMax);
    const hasTextOverlay = settings.addTextOverlay && Boolean(normalizedOverlayText);
    const hasVisualEdits =
      cropPercent > 0 ||
      settings.rotateDeg !== 0 ||
      settings.brightness !== 100 ||
      settings.contrast !== 100 ||
      settings.saturation !== 100 ||
      settings.blurPx > 0 ||
      settings.noisePercent > 0 ||
      settings.downscalePercent < 100 ||
      settings.jpegQuality < 100 ||
      settings.addBannerOverlay ||
      hasTextOverlay;

    if (!hasVisualEdits) {
      return {
        file: sourceFile,
        previewUrl: URL.createObjectURL(sourceFile),
        appliedEdits: ["No edits (exact file)"]
      };
    }

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = width;
    baseCanvas.height = height;
    const baseCtx = baseCanvas.getContext("2d");

    if (!baseCtx) {
      throw new Error("Unable to initialize image canvas");
    }

    baseCtx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`;

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

    if (settings.downscalePercent < 100) {
      const ratio = clamp(settings.downscalePercent, EDIT_LIMITS.downscaleMin, 100) / 100;
      const scaledWidth = Math.max(1, Math.round(width * ratio));
      const scaledHeight = Math.max(1, Math.round(height * ratio));

      const reducedCanvas = document.createElement("canvas");
      reducedCanvas.width = scaledWidth;
      reducedCanvas.height = scaledHeight;
      const reducedCtx = reducedCanvas.getContext("2d");

      if (!reducedCtx) {
        throw new Error("Unable to initialize downscale canvas");
      }

      reducedCtx.drawImage(finalCanvas, 0, 0, scaledWidth, scaledHeight);

      const restoredCanvas = document.createElement("canvas");
      restoredCanvas.width = width;
      restoredCanvas.height = height;
      const restoredCtx = restoredCanvas.getContext("2d");

      if (!restoredCtx) {
        throw new Error("Unable to initialize restoration canvas");
      }

      restoredCtx.drawImage(reducedCanvas, 0, 0, width, height);
      finalCanvas = restoredCanvas;
      appliedEdits.push(`Downscale ${settings.downscalePercent}% then restore`);
    }

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
      rotatedCtx.drawImage(finalCanvas, -width / 2, -height / 2, width, height);
      finalCanvas = rotatedCanvas;
      appliedEdits.push(`Rotate ${settings.rotateDeg} deg`);
    }

    if (settings.blurPx > 0) {
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = width;
      blurCanvas.height = height;
      const blurCtx = blurCanvas.getContext("2d");

      if (!blurCtx) {
        throw new Error("Unable to initialize blur canvas");
      }

      blurCtx.filter = `blur(${settings.blurPx.toFixed(1)}px)`;
      blurCtx.drawImage(finalCanvas, 0, 0, width, height);
      finalCanvas = blurCanvas;
      appliedEdits.push(`Blur ${settings.blurPx.toFixed(1)} px`);
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

    if (settings.saturation !== 100) {
      appliedEdits.push(`Saturation ${settings.saturation}%`);
    }

    if (settings.noisePercent > 0) {
      const imageData = finalCtx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const amplitude = (clamp(settings.noisePercent, 0, EDIT_LIMITS.noiseMax) / 100) * 90;
      let seed =
        (width * 73856093) ^
        (height * 19349663) ^
        (Math.round(settings.noisePercent * 100) * 83492791) ^
        (Math.round(settings.rotateDeg * 100) * 2654435761);

      const nextUnit = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967295;
      };

      for (let index = 0; index < data.length; index += 4) {
        const jitter = (nextUnit() * 2 - 1) * amplitude;
        const redShift = clamp(Math.round(jitter), -255, 255);
        const greenShift = clamp(Math.round(jitter * 0.8), -255, 255);
        const blueShift = clamp(Math.round(jitter * 1.1), -255, 255);

        data[index] = clamp(data[index] + redShift, 0, 255);
        data[index + 1] = clamp(data[index + 1] + greenShift, 0, 255);
        data[index + 2] = clamp(data[index + 2] + blueShift, 0, 255);
      }

      finalCtx.putImageData(imageData, 0, 0);
      appliedEdits.push(`Noise ${settings.noisePercent}%`);
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

    if (hasTextOverlay) {
      finalCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
      finalCtx.fillRect(8, 8, Math.max(120, Math.floor(width * 0.28)), Math.max(28, Math.floor(height * 0.12)));
      finalCtx.fillStyle = "rgba(248, 250, 252, 0.95)";
      finalCtx.font = `bold ${Math.max(16, Math.floor(height * 0.05))}px sans-serif`;
      finalCtx.fillText(normalizedOverlayText, 16, Math.max(30, Math.floor(height * 0.085)));
      appliedEdits.push(`Text overlay: ${normalizedOverlayText}`);
    }

    if (appliedEdits.length === 0) {
      appliedEdits.push("No edits (exact copy)");
    }

    const outputAsJpeg = settings.jpegQuality < 100;
    const outputType = outputAsJpeg ? "image/jpeg" : "image/png";
    const outputQuality = outputAsJpeg ? clamp(settings.jpegQuality, EDIT_LIMITS.jpegQualityMin, 100) / 100 : undefined;
    if (outputAsJpeg) {
      appliedEdits.push(`JPEG quality ${settings.jpegQuality}`);
    }

    const blob = await toBlob(finalCanvas, outputType, outputQuality);
    const previewUrl = URL.createObjectURL(blob);
    const extension = outputAsJpeg ? "jpg" : "png";
    const file = new File([blob], `candidate-${Date.now()}.${extension}`, { type: outputType });

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
  const [watermarkKey, setWatermarkKey] = useState("hash-lab-demo-key");
  const [isBuildingCandidate, setIsBuildingCandidate] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [compareResult, setCompareResult] = useState<DetectionPreviewCompareResponse | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
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
        setBenchmarkResults([]);
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
      const response = await previewDetectionCompare(
        referenceFile,
        candidateFile,
        threshold,
        watermarkKey.trim() || DEFAULT_WATERMARK_KEY
      );
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

  async function handleRunPresetBenchmark() {
    if (!referenceFile) {
      setNotice({ tone: "error", message: "Upload a reference image first." });
      return;
    }

    setIsBenchmarking(true);
    setBenchmarkResults([]);
    setNotice({ tone: "info", message: "Running preset benchmark cases..." });

    const key = watermarkKey.trim() || DEFAULT_WATERMARK_KEY;
    const collected: BenchmarkResult[] = [];

    try {
      for (const benchmarkCase of PRESET_BENCHMARK_CASES) {
        let builtCandidate: CandidateBuild | null = null;

        try {
          builtCandidate = await buildCandidateImage(referenceFile, benchmarkCase.settings);
          const response = await previewDetectionCompare(referenceFile, builtCandidate.file, threshold, key);
          const result = response.comparison.result;

          collected.push({
            id: benchmarkCase.id,
            label: benchmarkCase.label,
            hardness: benchmarkCase.hardness,
            edits: builtCandidate.appliedEdits,
            finalScore: result?.similarity_score ?? null,
            hashScore: result?.hash_similarity_score ?? null,
            geometricScore: result?.geometric_similarity_score ?? null,
            method: result?.match_method || "unknown",
            watermarkConfidence: response.watermarkComparison?.confidence ?? null,
            watermarkBer: response.watermarkComparison?.crossMediaBitErrorRate ?? null,
            isMatch: result?.is_match ?? false
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Benchmark case failed";
          collected.push({
            id: benchmarkCase.id,
            label: benchmarkCase.label,
            hardness: benchmarkCase.hardness,
            edits: [],
            finalScore: null,
            hashScore: null,
            geometricScore: null,
            method: "error",
            watermarkConfidence: null,
            watermarkBer: null,
            isMatch: null,
            error: message
          });
        } finally {
          if (builtCandidate?.previewUrl) {
            URL.revokeObjectURL(builtCandidate.previewUrl);
          }
        }

        setBenchmarkResults([...collected]);
      }

      const matchedCount = collected.filter((item) => item.isMatch).length;
      const passRate = collected.length === 0 ? 0 : matchedCount / collected.length;
      setNotice({
        tone: passRate >= 0.55 ? "success" : "info",
        message: `Preset benchmark completed: ${matchedCount}/${PRESET_BENCHMARK_CASES.length} cases matched at threshold ${threshold}.`
      });
    } finally {
      setIsBenchmarking(false);
    }
  }

  function handleResetEdits() {
    setSettings(DEFAULT_SETTINGS);
    setBenchmarkResults([]);
    setCompareResult(null);
    setNotice({ tone: "info", message: "Edits reset. Candidate regenerated from reference." });
  }

  const similarityScore = compareResult?.comparison.result?.similarity_score || 0;
  const isMatch = Boolean(compareResult?.comparison.result?.is_match);
  const watermarkConfidence = compareResult?.watermarkComparison?.confidence || 0;
  const watermarkBer = compareResult?.watermarkComparison?.crossMediaBitErrorRate || 1;
  const watermarkLooksRecovered = watermarkConfidence >= 0.5 && watermarkBer <= 0.25;
  const noiseSignals = useMemo(() => getNoiseSignals(settings), [settings]);
  const activeNoiseSignals = useMemo(
    () => noiseSignals.filter((signal) => signal.intensity > 0),
    [noiseSignals]
  );
  const noiseSeverityScore = useMemo(() => {
    if (noiseSignals.length === 0) {
      return 0;
    }

    const total = noiseSignals.reduce((sum, signal) => sum + signal.intensity, 0);
    return Math.round((total / noiseSignals.length) * 100);
  }, [noiseSignals]);
  const noiseSeverityLabel = getNoiseSeverityLabel(noiseSeverityScore);
  const phashDistance = compareResult
    ? hexBitDistance(compareResult.reference.hash, compareResult.candidate.hash)
    : 0;
  const benchmarkTrend = useMemo(() => {
    const completed = benchmarkResults
      .filter((item) => typeof item.finalScore === "number")
      .sort((left, right) => left.hardness - right.hardness);

    if (completed.length === 0) {
      return null;
    }

    const width = 760;
    const height = 240;
    const padding = { top: 18, right: 18, bottom: 34, left: 44 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const minHardness = completed[0].hardness;
    const maxHardness = completed[completed.length - 1].hardness;
    const hardnessRange = Math.max(1, maxHardness - minHardness);

    const xForHardness = (hardness: number) =>
      padding.left + ((hardness - minHardness) / hardnessRange) * plotWidth;

    const yForScore = (score: number) =>
      padding.top + (1 - clamp(score / 100, 0, 1)) * plotHeight;

    const finalPoints = completed.map((item) => ({
      x: xForHardness(item.hardness),
      y: yForScore(item.finalScore ?? 0)
    }));

    const hashPoints = completed.map((item) => ({
      x: xForHardness(item.hardness),
      y: yForScore(item.hashScore ?? 0)
    }));

    const geometricPoints = completed.map((item) => ({
      x: xForHardness(item.hardness),
      y: yForScore(item.geometricScore ?? 0)
    }));

    const watermarkPoints = completed.map((item) => ({
      x: xForHardness(item.hardness),
      y: yForScore((item.watermarkConfidence ?? 0) * 100)
    }));

    const avgFinal =
      completed.reduce((sum, item) => sum + (item.finalScore ?? 0), 0) / Math.max(1, completed.length);

    return {
      width,
      height,
      padding,
      minHardness,
      maxHardness,
      thresholdY: yForScore(threshold),
      finalPoints,
      hashPoints,
      geometricPoints,
      watermarkPoints,
      finalPath: buildLinePath(finalPoints),
      hashPath: buildLinePath(hashPoints),
      geometricPath: buildLinePath(geometricPoints),
      watermarkPath: buildLinePath(watermarkPoints),
      averageFinal: avgFinal,
      matchedCount: completed.filter((item) => item.isMatch).length,
      totalCount: completed.length,
      cases: completed
    };
  }, [benchmarkResults, threshold]);

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
                max={EDIT_LIMITS.cropMax}
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
                min={-EDIT_LIMITS.rotateMax}
                max={EDIT_LIMITS.rotateMax}
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
                min={EDIT_LIMITS.brightnessMin}
                max={EDIT_LIMITS.brightnessMax}
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
                min={EDIT_LIMITS.contrastMin}
                max={EDIT_LIMITS.contrastMax}
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

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saturation</span>
              <input
                type="range"
                min={EDIT_LIMITS.saturationMin}
                max={EDIT_LIMITS.saturationMax}
                value={settings.saturation}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    saturation: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.saturation}%</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blur (px)</span>
              <input
                type="range"
                min={0}
                max={EDIT_LIMITS.blurMax}
                step={0.5}
                value={settings.blurPx}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    blurPx: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.blurPx.toFixed(1)} px</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Noise (%)</span>
              <input
                type="range"
                min={0}
                max={EDIT_LIMITS.noiseMax}
                value={settings.noisePercent}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    noisePercent: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.noisePercent}%</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Downscale (%)</span>
              <input
                type="range"
                min={EDIT_LIMITS.downscaleMin}
                max={EDIT_LIMITS.downscaleMax}
                value={settings.downscalePercent}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    downscalePercent: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.downscalePercent}%</p>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">JPEG Quality</span>
              <input
                type="range"
                min={EDIT_LIMITS.jpegQualityMin}
                max={EDIT_LIMITS.jpegQualityMax}
                value={settings.jpegQuality}
                onChange={(event) =>
                  setSettings((previous) => ({
                    ...previous,
                    jpegQuality: Number(event.target.value)
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-slate-600">{settings.jpegQuality}</p>
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

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Watermark Key</span>
              <input
                type="text"
                value={watermarkKey}
                onChange={(event) => setWatermarkKey(event.target.value)}
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
              disabled={!referenceFile || !candidateFile || isBuildingCandidate || isComparing || isBenchmarking}
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
        <h2 className="text-xl font-bold text-slate-900">Detection Explainability</h2>
        <p className="mt-2 text-sm text-slate-600">
          This panel explains what synthetic noise is applied and how the hybrid matcher decides whether the candidate still matches the reference.
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Noise Recipe</p>
              <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                Severity {noiseSeverityScore}% ({noiseSeverityLabel})
              </span>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-amber-500" style={{ width: `${noiseSeverityScore}%` }} />
            </div>

            <ul className="mt-4 space-y-2">
              {noiseSignals.map((signal) => (
                <li key={signal.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-800">{signal.label}</p>
                    <p className="text-xs text-slate-500">{signal.detail}</p>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round(signal.intensity * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            {activeNoiseSignals.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No synthetic noise added. Candidate is exact file copy.</p>
            ) : null}
          </article>

          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">How Hash Detection Works</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>Normalize both images (EXIF orientation, alpha flattening, autocontrast).</li>
              <li>Build crop-aware variants (full, center, corners).</li>
              <li>Compute weighted multi-hash score from pHash, dHash, wHash, and aHash.</li>
              <li>If needed, run geometric fallback (ORB + RANSAC) for crop/rotation/overlay resilience.</li>
              <li>Final decision uses max(hash score, geometric score) against threshold.</li>
            </ol>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hash Weights</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {HASH_EXPLANATION_WEIGHTS.map((item) => (
                  <li key={item.id}>
                    {item.label} ({item.weightPercent}%): {item.description}
                  </li>
                ))}
              </ul>
            </div>

            {compareResult ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold uppercase tracking-wide text-slate-500">Live Run Metrics</p>
                <p className="mt-2">pHash bit distance: {phashDistance} bits</p>
                <p className="mt-1">Hash score: {compareResult.comparison.result?.hash_similarity_score ?? "N/A"}</p>
                <p className="mt-1">Geometric score: {compareResult.comparison.result?.geometric_similarity_score ?? "N/A"}</p>
                <p className="mt-1">Geometric status: {compareResult.comparison.result?.geometric_status || "N/A"}</p>
                <p className="mt-1">Good matches / inliers: {compareResult.comparison.result?.geometric_good_matches ?? "N/A"} / {compareResult.comparison.result?.geometric_inliers ?? "N/A"}</p>
                <p className="mt-1">Decision: max({compareResult.comparison.result?.hash_similarity_score ?? 0}, {compareResult.comparison.result?.geometric_similarity_score ?? 0}) {">="} {compareResult.comparison.threshold}</p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Run a tracking check to view live explainability metrics.</p>
            )}
          </article>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Preset Stress Check</h2>
            <p className="text-sm text-slate-600">
              Run a progressive benchmark ladder with increasingly harder edits and visualize detection effectiveness against hardness.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunPresetBenchmark}
            disabled={!referenceFile || isBuildingCandidate || isComparing || isBenchmarking}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {isBenchmarking ? "Running Benchmark..." : "Run Preset Benchmark"}
          </button>
        </div>

        {benchmarkResults.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No benchmark run yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Case</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Hardness</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Final</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Hash</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Geometric</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Method</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">WM Conf</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">WM BER</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {benchmarkResults.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-slate-800">{item.label}</p>
                      {item.error ? (
                        <p className="text-xs text-rose-600">{item.error}</p>
                      ) : (
                        <p className="text-xs text-slate-500">{item.edits.join(" • ") || "N/A"}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item.hardness}</td>
                    <td className="px-3 py-2 text-slate-700">{formatMetric(item.finalScore, 0)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatMetric(item.hashScore, 0)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatMetric(item.geometricScore, 0)}</td>
                    <td className="px-3 py-2 text-slate-700">{item.method}</td>
                    <td className="px-3 py-2 text-slate-700">{formatMetric(item.watermarkConfidence, 3)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatMetric(item.watermarkBer, 4)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          item.isMatch === true
                            ? "bg-emerald-100 text-emerald-700"
                            : item.isMatch === false
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.isMatch === true ? "Matched" : item.isMatch === false ? "No Match" : "Error"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {benchmarkTrend ? (
          <article className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Effectiveness vs Hardness</p>
                <p className="text-xs text-slate-500">
                  Hardness range {benchmarkTrend.minHardness} to {benchmarkTrend.maxHardness} • Avg final score {benchmarkTrend.averageFinal.toFixed(1)}
                </p>
              </div>
              <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Matched {benchmarkTrend.matchedCount}/{benchmarkTrend.totalCount}
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <svg viewBox={`0 0 ${benchmarkTrend.width} ${benchmarkTrend.height}`} className="h-64 w-full min-w-160">
                <rect x="0" y="0" width={benchmarkTrend.width} height={benchmarkTrend.height} fill="#f8fafc" rx="10" />

                {[0, 25, 50, 75, 100].map((tick) => {
                  const y = benchmarkTrend.padding.top + (1 - tick / 100) * (benchmarkTrend.height - benchmarkTrend.padding.top - benchmarkTrend.padding.bottom);
                  return (
                    <g key={tick}>
                      <line
                        x1={benchmarkTrend.padding.left}
                        x2={benchmarkTrend.width - benchmarkTrend.padding.right}
                        y1={y}
                        y2={y}
                        stroke="#cbd5e1"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text x={benchmarkTrend.padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                        {tick}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={benchmarkTrend.padding.left}
                  x2={benchmarkTrend.width - benchmarkTrend.padding.right}
                  y1={benchmarkTrend.thresholdY}
                  y2={benchmarkTrend.thresholdY}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />

                <path d={benchmarkTrend.finalPath} fill="none" stroke="#059669" strokeWidth="2.5" />
                <path d={benchmarkTrend.hashPath} fill="none" stroke="#2563eb" strokeWidth="2" />
                <path d={benchmarkTrend.geometricPath} fill="none" stroke="#d97706" strokeWidth="2" />
                <path d={benchmarkTrend.watermarkPath} fill="none" stroke="#7c3aed" strokeWidth="2" />

                {benchmarkTrend.cases.map((item, index) => {
                  const x = benchmarkTrend.finalPoints[index]?.x ?? benchmarkTrend.padding.left;
                  const y = benchmarkTrend.finalPoints[index]?.y ?? benchmarkTrend.padding.top;
                  return (
                    <g key={item.id}>
                      <circle cx={x} cy={y} r="3.5" fill="#059669" />
                      <text x={x} y={benchmarkTrend.height - 12} textAnchor="middle" fontSize="10" fill="#475569">
                        {item.hardness}
                      </text>
                    </g>
                  );
                })}

                <text x={benchmarkTrend.width / 2} y={benchmarkTrend.height - 2} textAnchor="middle" fontSize="11" fill="#334155">
                  Edit Hardness
                </text>
                <text x="14" y={benchmarkTrend.height / 2} transform={`rotate(-90 14 ${benchmarkTrend.height / 2})`} textAnchor="middle" fontSize="11" fill="#334155">
                  Score
                </text>
              </svg>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Final Score</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Hash Score</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-600" /> Geometric Score</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-600" /> Watermark Confidence x100</span>
              <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-red-500" /> Threshold</span>
            </div>
          </article>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Comparison Results</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              isMatch ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {compareResult ? (isMatch ? "Tracked" : "Below Threshold") : "Awaiting Check"}
          </span>
        </div>

        {compareResult ? (
          <div className="mt-4 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method A</p>
                <p className="mt-1 text-lg font-bold text-slate-900">Perceptual Hash Match</p>
                <p className="mt-2 text-sm text-slate-700">
                  Score {similarityScore} / Threshold {compareResult.comparison.threshold}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Hash score: {compareResult.comparison.result?.hash_similarity_score ?? "N/A"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Geometric score: {compareResult.comparison.result?.geometric_similarity_score ?? "N/A"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Algorithm: {compareResult.comparison.algorithm}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Winning method: {compareResult.comparison.result?.match_method || "N/A"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Variant: {compareResult.comparison.result?.match_variant || "N/A"}
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    isMatch ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {isMatch ? "Tracked" : "Below Threshold"}
                </span>
              </article>

              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Method B</p>
                <p className="mt-1 text-lg font-bold text-slate-900">Watermark Recovery</p>
                <p className="mt-2 text-sm text-slate-700">
                  Confidence {watermarkConfidence.toFixed(3)}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Cross-media BER {watermarkBer.toFixed(4)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Frames used: {compareResult.watermarkComparison.framesUsed}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  ECC: {compareResult.watermarkComparison.eccScheme} ({compareResult.watermarkComparison.encodedBitLength} bits)
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    watermarkLooksRecovered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {watermarkLooksRecovered ? "Recovered" : "Weak Recovery"}
                </span>
              </article>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Fingerprint</p>
              <p className="mt-2 font-mono text-sm text-slate-800">{truncateHash(compareResult.reference.hash)}</p>
              <p className="mt-1 text-xs text-slate-500">{compareResult.reference.algorithm}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Watermark Reference</p>
              <p className="mt-1 font-mono text-xs text-slate-700">{truncateHash(compareResult.watermarkComparison.referenceFingerprint)}</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate Fingerprint</p>
              <p className="mt-2 font-mono text-sm text-slate-800">{truncateHash(compareResult.candidate.hash)}</p>
              <p className="mt-1 text-xs text-slate-500">{compareResult.candidate.algorithm}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recovered Watermark</p>
              <p className="mt-1 font-mono text-xs text-slate-700">{truncateHash(compareResult.watermarkComparison.recoveredFingerprint)}</p>
            </article>
            </div>

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
              <p className="mt-1 text-xs text-slate-500">
                Watermark key used: {compareResult.watermarkComparison.key}
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
