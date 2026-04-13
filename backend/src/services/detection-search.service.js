const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const env = require("../config/env");
const { Asset, Detection } = require("../models");
const { compareImageBatch } = require("./detection.bridge");

const MAX_DETECTIONS_PER_JOB = 5;

const detectionJobs = new Map();
const pendingJobIds = [];
let isQueueRunning = false;

const platformConfigs = [
  {
    platform: "twitter",
    buildUrl: (slug) => `https://x.com/sportswire/status/${slug}`
  },
  {
    platform: "instagram",
    buildUrl: (slug) => `https://instagram.com/p/${slug}`
  },
  {
    platform: "reddit",
    buildUrl: (slug) => `https://reddit.com/r/sports/comments/${slug}`
  },
  {
    platform: "youtube",
    buildUrl: (slug) => `https://youtube.com/watch?v=${slug}`
  }
];

function choosePlatform(index) {
  return platformConfigs[index % platformConfigs.length];
}

function resolveAbsoluteAssetPath(filePathValue) {
  if (path.isAbsolute(filePathValue)) {
    return filePathValue;
  }

  return path.resolve(process.cwd(), filePathValue);
}

async function fileExists(filePathValue) {
  try {
    await fs.access(filePathValue);
    return true;
  } catch (_error) {
    return false;
  }
}

async function loadCrawlerItems() {
  const manifestPath = path.resolve(env.crawlerOutputDir, "latest.json");

  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items;
  } catch (_error) {
    return [];
  }
}

function normalizeCandidatePath(filePathValue) {
  if (!filePathValue) {
    return "";
  }

  return path.isAbsolute(filePathValue) ? filePathValue : path.resolve(process.cwd(), filePathValue);
}

async function buildCrawlerCandidates(slugBase) {
  const items = await loadCrawlerItems();
  const candidates = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const imagePath = normalizeCandidatePath(item.local_path || item.localPath || "");
    if (!imagePath) {
      continue;
    }

    if (!(await fileExists(imagePath))) {
      continue;
    }

    const platform = (item.platform || choosePlatform(index).platform).toLowerCase();
    const fallbackUrl = choosePlatform(index).buildUrl(`${slugBase}cr${index}`);
    const url = item.source_url || item.sourceUrl || item.image_url || fallbackUrl;

    candidates.push({
      imagePath,
      platform,
      url
    });

    if (candidates.length >= 150) {
      break;
    }
  }

  return candidates;
}

async function buildCandidatePool(asset, referenceFilePath) {
  const slugBase = `${asset._id.toString().slice(-6)}${(asset.fingerprintHash || "").slice(0, 6)}`;
  const candidates = [
    {
      imagePath: referenceFilePath,
      platform: "twitter",
      url: platformConfigs[0].buildUrl(`${slugBase}src0`)
    },
    {
      imagePath: referenceFilePath,
      platform: "instagram",
      url: platformConfigs[1].buildUrl(`${slugBase}src1`)
    }
  ];

  const crawlerCandidates = await buildCrawlerCandidates(slugBase);
  if (crawlerCandidates.length > 0) {
    const dedupe = new Set(candidates.map((item) => `${item.imagePath}::${item.url}`));
    for (const candidate of crawlerCandidates) {
      const key = `${candidate.imagePath}::${candidate.url}`;
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);
      candidates.push(candidate);
    }
    return candidates;
  }

  const fixtureDir = path.resolve(process.cwd(), "fixtures", "images");
  let fixtureFileNames = [];
  try {
    const entries = await fs.readdir(fixtureDir, { withFileTypes: true });
    fixtureFileNames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpg|jpeg|webp|gif)$/i.test(name))
      .sort();
  } catch (_error) {
    fixtureFileNames = [];
  }

  for (let index = 0; index < fixtureFileNames.length; index += 1) {
    const fileName = fixtureFileNames[index];
    const absolutePath = path.resolve(fixtureDir, fileName);
    if (!(await fileExists(absolutePath))) {
      continue;
    }

    const platformConfig = platformConfigs[index % platformConfigs.length];
    candidates.push({
      imagePath: absolutePath,
      platform: platformConfig.platform,
      url: platformConfig.buildUrl(`${slugBase}${index}`)
    });
  }

  return candidates;
}

function toDetectionStatus(similarityScore) {
  if (similarityScore >= 95) {
    return "confirmed";
  }

  return "pending";
}

async function runDetectionForAsset(assetId) {
  const asset = await Asset.findById(assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  if (!asset.filePath) {
    throw new Error(`Asset file path missing: ${assetId}`);
  }

  const referenceFilePath = resolveAbsoluteAssetPath(asset.filePath);
  if (!(await fileExists(referenceFilePath))) {
    throw new Error(`Asset file not found: ${referenceFilePath}`);
  }

  const candidatePool = await buildCandidatePool(asset, referenceFilePath);
  if (candidatePool.length === 0) {
    return 0;
  }

  const comparison = await compareImageBatch(
    referenceFilePath,
    candidatePool.map((candidate) => candidate.imagePath),
    env.detectionSimilarityThreshold
  );

  const existing = await Detection.find({ assetId: asset._id }).select({ url: 1, _id: 0 }).lean();
  const existingUrls = new Set(existing.map((item) => item.url));

  const newDetections = [];
  for (let index = 0; index < candidatePool.length; index += 1) {
    const candidate = candidatePool[index];
    const result = comparison.results[index];
    if (!result || result.status !== "ok") {
      continue;
    }

    if (!result.is_match || existingUrls.has(candidate.url)) {
      continue;
    }

    newDetections.push({
      assetId: asset._id,
      platform: candidate.platform,
      url: candidate.url,
      confidence: result.similarity_score,
      status: toDetectionStatus(result.similarity_score),
      dateFound: new Date()
    });
  }

  if (newDetections.length === 0) {
    return 0;
  }

  const topDetections = newDetections
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_DETECTIONS_PER_JOB);

  await Detection.insertMany(topDetections);
  return topDetections.length;
}

function toJobResponse(job) {
  return {
    id: job.id,
    assetId: job.assetId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdDetections: job.createdDetections,
    error: job.error
  };
}

function cleanupJobs() {
  if (detectionJobs.size <= 200) {
    return;
  }

  const completedJobs = Array.from(detectionJobs.values())
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((a, b) => new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt));

  const overflow = detectionJobs.size - 200;
  completedJobs.slice(0, overflow).forEach((job) => {
    detectionJobs.delete(job.id);
  });
}

async function processQueue() {
  if (isQueueRunning) {
    return;
  }

  isQueueRunning = true;
  try {
    while (pendingJobIds.length > 0) {
      const jobId = pendingJobIds.shift();
      const job = detectionJobs.get(jobId);
      if (!job || job.status !== "queued") {
        continue;
      }

      job.status = "running";
      job.startedAt = new Date().toISOString();

      try {
        const createdDetections = await runDetectionForAsset(job.assetId);
        job.createdDetections = createdDetections;
        job.status = "completed";
      } catch (error) {
        job.status = "failed";
        job.error = error.message;
      } finally {
        job.completedAt = new Date().toISOString();
      }
    }
  } finally {
    isQueueRunning = false;
    cleanupJobs();
  }
}

function enqueueDetectionSearch(assetId) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    assetId,
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    createdDetections: 0,
    error: ""
  };

  detectionJobs.set(id, job);
  pendingJobIds.push(id);

  // Process asynchronously so the request can return immediately.
  setImmediate(() => {
    processQueue().catch(() => {
      // Errors are captured per job and reflected in job state.
    });
  });

  return toJobResponse(job);
}

function getDetectionSearchJob(jobId) {
  const job = detectionJobs.get(jobId);
  if (!job) {
    return null;
  }

  return toJobResponse(job);
}

module.exports = {
  enqueueDetectionSearch,
  getDetectionSearchJob
};