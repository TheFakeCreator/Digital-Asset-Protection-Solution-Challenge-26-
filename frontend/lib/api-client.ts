const DEFAULT_API_BASE_URL = "http://localhost:3001";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type HealthResponse = {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
};

export type Asset = {
  _id: string;
  name: string;
  creator: string;
  eventDate: string;
  uploadDate: string;
  fingerprintHash: string;
  originalFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  filePath?: string;
  fileUrl?: string;
};

export type AssetListResponse = {
  items: Asset[];
  page: number;
  limit: number;
  total: number;
};

export type DetectionAssetSummary = {
  _id: string;
  name: string;
  creator?: string;
  eventDate?: string;
};

export type Detection = {
  _id: string;
  assetId: string | DetectionAssetSummary;
  platform: string;
  url: string;
  imageSignature?: string;
  sourceLocalPath?: string;
  confidence: number;
  status: "pending" | "confirmed" | "dismissed";
  dateFound: string;
  lastSeenAt?: string;
  occurrenceCount?: number;
  history?: Array<{
    url: string;
    platform: string;
    sourceLocalPath: string;
    similarityScore: number;
    dateFound: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type DetectionListResponse = {
  items: Detection[];
  page: number;
  limit: number;
  total: number;
};

export type DetectionBatchItemResult = {
  assetId: string;
  status: "completed" | "failed";
  createdDetections: number;
  updatedDetections: number;
  error?: string;
};

export type DetectionSearchJob = {
  id: string;
  type: "single" | "batch";
  assetId: string | null;
  assetIds: string[];
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdDetections: number;
  updatedDetections: number;
  totalAssets: number;
  processedAssets: number;
  batchResults: DetectionBatchItemResult[];
  error: string;
};

export type DetectionSearchResponse = {
  job: DetectionSearchJob;
};

export type DetectionPreviewCompareResult = {
  image_path: string;
  algorithm: string;
  status: "ok" | "error" | "skipped";
  is_match: boolean;
  similarity_score: number;
  match_variant?: string;
  width?: number;
  height?: number;
  error_code?: string;
  error?: string;
};

export type DetectionPreviewCompareResponse = {
  reference: {
    fileName: string;
    hash: string;
    algorithm: string;
  };
  candidate: {
    fileName: string;
    hash: string;
    algorithm: string;
  };
  comparison: {
    algorithm: string;
    threshold: number;
    referenceVariants: string[];
    result: DetectionPreviewCompareResult | null;
  };
};

export type UploadAssetInput = {
  name: string;
  creator: string;
  eventDate: string;
  mediaFile: File;
};

export type UploadAssetResponse = {
  asset: Asset;
  fingerprint: {
    hash: string;
    algorithm: string;
    input_path?: string;
  };
};

function buildUrl(pathname: string) {
  if (pathname.startsWith("/")) {
    return `${API_BASE_URL}${pathname}`;
  }
  return `${API_BASE_URL}/${pathname}`;
}

async function requestApi<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const response = await fetch(buildUrl(pathname), {
    ...init,
    cache: "no-store",
    headers
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (payload && !payload.success) {
      throw new Error(payload.error.message || "API request failed");
    }
    throw new Error(`API request failed with status ${response.status}`);
  }

  if (!payload || !payload.success) {
    throw new Error("Unexpected API response shape");
  }

  return payload.data;
}

export function fetchHealth() {
  return requestApi<HealthResponse>("/api/v1/health");
}

export function fetchAssets(page = 1, limit = 5) {
  return requestApi<AssetListResponse>(`/api/v1/assets?page=${page}&limit=${limit}`);
}

export function fetchDetections(assetId?: string, page = 1, limit = 20) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (assetId) {
    params.set("asset_id", assetId);
  }

  return requestApi<DetectionListResponse>(`/api/v1/detections?${params.toString()}`);
}

export function triggerDetectionSearch(assetId: string) {
  return requestApi<DetectionSearchResponse>(`/api/v1/detections/search/${assetId}`, {
    method: "POST"
  });
}

export function triggerBatchDetectionSearch(assetIds: string[]) {
  return requestApi<DetectionSearchResponse>("/api/v1/detections/search/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ assetIds })
  });
}

export function fetchDetectionJob(jobId: string) {
  return requestApi<DetectionSearchJob>(`/api/v1/detections/jobs/${jobId}`);
}

export function previewDetectionCompare(referenceFile: File, candidateFile: File, threshold = 85) {
  const formData = new FormData();
  formData.append("reference", referenceFile);
  formData.append("candidate", candidateFile);
  formData.append("threshold", String(threshold));

  return requestApi<DetectionPreviewCompareResponse>("/api/v1/detections/preview-compare", {
    method: "POST",
    body: formData
  });
}

export function createAsset(input: UploadAssetInput) {
  const formData = new FormData();
  formData.append("name", input.name.trim());
  formData.append("creator", input.creator.trim());
  formData.append("eventDate", input.eventDate);
  formData.append("media", input.mediaFile);

  return requestApi<UploadAssetResponse>("/api/v1/assets", {
    method: "POST",
    body: formData
  });
}

export function toAssetFileUrl(fileUrl?: string) {
  if (!fileUrl) {
    return "";
  }

  if (/^https?:\/\//.test(fileUrl)) {
    return fileUrl;
  }

  if (fileUrl.startsWith("/")) {
    return `${API_BASE_URL}${fileUrl}`;
  }

  return `${API_BASE_URL}/${fileUrl}`;
}