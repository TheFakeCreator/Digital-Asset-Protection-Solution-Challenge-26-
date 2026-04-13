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

export type AssetListResponse = {
  items: Array<{
    _id: string;
    name: string;
    creator: string;
    eventDate: string;
    uploadDate: string;
    fingerprintHash: string;
  }>;
  page: number;
  limit: number;
  total: number;
};

function buildUrl(pathname: string) {
  if (pathname.startsWith("/")) {
    return `${API_BASE_URL}${pathname}`;
  }
  return `${API_BASE_URL}/${pathname}`;
}

async function requestApi<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(pathname), {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {})
    }
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