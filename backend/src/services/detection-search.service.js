const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const env = require("../config/env");
const { Asset, Detection } = require("../models");
const { compareImageBatch } = require("./detection.bridge");
const { getJson, setJson } = require("./cache.service");

const MAX_DETECTIONS_PER_JOB = 5;
const MAX_CANDIDATES_PER_JOB = 150;

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

async function computeFileSignature(filePathValue) {
  try {
    const content = await fs.readFile(filePathValue);
    return crypto.createHash("sha1").update(content).digest("hex");
  } catch (_error) {
    return "";
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

function buildHistoryEntry(candidate, similarityScore, detectedAt) {
  return {
    url: candidate.url,
    platform: candidate.platform,
    sourceLocalPath: candidate.sourceLocalPath || candidate.imagePath || "",
    similarityScore,
    dateFound: detectedAt
  };
}

function toDetectionStatus(similarityScore) {
  if (similarityScore >= 95) {
    return "confirmed";
  }

  return "pending";
}

function buildComparisonCacheKey(asset, candidatePool) {
  const rawSignature = candidatePool
    .map((candidate) =>
      [candidate.imageSignature || "", candidate.imagePath, candidate.url, candidate.platform].join("|")
    )
    .join("||");

  const digest = crypto.createHash("sha1").update(rawSignature).digest("hex");

  return [
    "detection:compare",
    asset._id.toString(),
    asset.fingerprintHash || "none",
    env.detectionSimilarityThreshold,
    digest
  ].join(":");
}

function dedupeBySource(candidates) {
  const dedupe = new Set();
  const result = [];

  for (const candidate of candidates) {
    const key = `${candidate.imagePath}::${candidate.url}`;
    if (dedupe.has(key)) {
      continue;
    }

    dedupe.add(key);
    result.push(candidate);

    if (result.length >= MAX_CANDIDATES_PER_JOB) {
      break;
    }
  }

  return result;
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

    const imageSignature = await computeFileSignature(imagePath);
    if (!imageSignature) {
      continue;
    }

    const platform = (item.platform || choosePlatform(index).platform).toLowerCase();
    const fallbackUrl = choosePlatform(index).buildUrl(`${slugBase}cr${index}`);
    const url = item.source_url || item.sourceUrl || item.image_url || fallbackUrl;

    candidates.push({
      imagePath,
      sourceLocalPath: imagePath,
      imageSignature,
      platform,
      url
    });

    if (candidates.length >= MAX_CANDIDATES_PER_JOB) {
      break;
    }
  }

  return candidates;
}

async function buildFixtureCandidates(slugBase) {
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

  const candidates = [];
  for (let index = 0; index < fixtureFileNames.length; index += 1) {
    const fileName = fixtureFileNames[index];
    const absolutePath = path.resolve(fixtureDir, fileName);
    if (!(await fileExists(absolutePath))) {
      continue;
    }

    const imageSignature = await computeFileSignature(absolutePath);
    if (!imageSignature) {
      continue;
    }

    const platformConfig = choosePlatform(index);
    candidates.push({
      imagePath: absolutePath,
      sourceLocalPath: absolutePath,
      imageSignature,
      platform: platformConfig.platform,
      url: platformConfig.buildUrl(`${slugBase}${index}`)
    });
  }

  return candidates;
}

async function buildCandidatePool(asset, referenceFilePath) {
  const slugBase = `${asset._id.toString().slice(-6)}${(asset.fingerprintHash || "").slice(0, 6)}`;
  const referenceSignature = await computeFileSignature(referenceFilePath);

  const baselineCandidates = referenceSignature
    ? [
        {
          imagePath: referenceFilePath,
          sourceLocalPath: referenceFilePath,
          imageSignature: referenceSignature,
          platform: "twitter",
          url: platformConfigs[0].buildUrl(`${slugBase}src0`)
        },
        {
          imagePath: referenceFilePath,
          sourceLocalPath: referenceFilePath,
          imageSignature: referenceSignature,
          platform: "instagram",
          url: platformConfigs[1].buildUrl(`${slugBase}src1`)
        }
      ]
    : [];

  const crawlerCandidates = await buildCrawlerCandidates(slugBase);
  if (crawlerCandidates.length > 0) {
    return dedupeBySource([...baselineCandidates, ...crawlerCandidates]);
  }

  const fixtureCandidates = await buildFixtureCandidates(slugBase);
  return dedupeBySource([...baselineCandidates, ...fixtureCandidates]);
}

async function getComparisonResult(asset, referenceFilePath, candidatePool) {
  const cacheKey = buildComparisonCacheKey(asset, candidatePool);
  const cached = await getJson(cacheKey);

  if (cached && Array.isArray(cached.results) && cached.results.length === candidatePool.length) {
    return cached;
  }

  const comparison = await compareImageBatch(
    referenceFilePath,
    candidatePool.map((candidate) => candidate.imagePath),
    env.detectionSimilarityThreshold
  );

  await setJson(cacheKey, comparison, env.detectionCacheTtlSeconds);
  return comparison;
}

function collapseMatches(assetId, candidatePool, comparison) {
  const grouped = new Map();
  const detectedAt = new Date();

  for (let index = 0; index < candidatePool.length; index += 1) {
    const candidate = candidatePool[index];
    const result = comparison.results[index];

    if (!candidate || !result || result.status !== "ok" || !result.is_match) {
      continue;
    }

    const similarityScore = result.similarity_score;
    const key = candidate.imageSignature ? `sig:${candidate.imageSignature}` : `url:${candidate.url}`;
    const historyEntry = buildHistoryEntry(candidate, similarityScore, detectedAt);

    if (!grouped.has(key)) {
      grouped.set(key, {
        assetId,
        platform: candidate.platform,
        url: candidate.url,
        imageSignature: candidate.imageSignature || "",
        sourceLocalPath: candidate.sourceLocalPath || candidate.imagePath || "",
        confidence: similarityScore,
        status: toDetectionStatus(similarityScore),
        dateFound: detectedAt,
        lastSeenAt: detectedAt,
        occurrenceCount: 1,
        history: [historyEntry]
      });
      continue;
    }

    const current = grouped.get(key);
    current.history.push(historyEntry);

    if (similarityScore > current.confidence) {
      current.confidence = similarityScore;
      current.status = toDetectionStatus(similarityScore);
      current.platform = candidate.platform;
      current.url = candidate.url;
      current.sourceLocalPath = candidate.sourceLocalPath || candidate.imagePath || "";
    }
  }

  const collapsed = [];
  for (const match of grouped.values()) {
    const historyByUrl = new Map();
    for (const entry of match.history) {
      const existing = historyByUrl.get(entry.url);
      if (!existing || entry.similarityScore > existing.similarityScore) {
        historyByUrl.set(entry.url, entry);
      }
    }

    match.history = Array.from(historyByUrl.values());
    match.occurrenceCount = match.history.length || 1;
    collapsed.push(match);
  }

  return collapsed.sort((a, b) => b.confidence - a.confidence);
}

async function persistDetections(assetId, matches) {
  if (matches.length === 0) {
    return {
      createdDetections: 0,
      updatedDetections: 0
    };
  }

  const existingDetections = await Detection.find({ assetId }).lean();
  const existingBySignature = new Map();
  const existingByUrl = new Map();

  for (const existing of existingDetections) {
    if (existing.imageSignature) {
      existingBySignature.set(existing.imageSignature, existing);
    }
    existingByUrl.set(existing.url, existing);
  }

  const updateOps = [];
  const createCandidates = [];

  for (const match of matches) {
    const existing =
      (match.imageSignature && existingBySignature.get(match.imageSignature)) ||
      existingByUrl.get(match.url);

    if (!existing) {
      createCandidates.push(match);
      continue;
    }

    const existingHistory = Array.isArray(existing.history) ? existing.history : [];
    const existingHistoryByUrl = new Map(existingHistory.map((entry) => [entry.url, entry]));

    for (const historyItem of match.history) {
      const current = existingHistoryByUrl.get(historyItem.url);
      if (!current || historyItem.similarityScore > current.similarityScore) {
        existingHistoryByUrl.set(historyItem.url, historyItem);
      }
    }

    const mergedHistory = Array.from(existingHistoryByUrl.values());
    const maxConfidence = Math.max(existing.confidence || 0, match.confidence);

    updateOps.push({
      updateOne: {
        filter: { _id: existing._id },
        update: {
          $set: {
            platform: match.platform,
            url: match.url,
            imageSignature: existing.imageSignature || match.imageSignature || "",
            sourceLocalPath: match.sourceLocalPath,
            confidence: maxConfidence,
            status: toDetectionStatus(maxConfidence),
            lastSeenAt: new Date(),
            history: mergedHistory,
            occurrenceCount: mergedHistory.length || existing.occurrenceCount || 1
          }
        }
      }
    });
  }

  const limitedCreates = createCandidates.slice(0, MAX_DETECTIONS_PER_JOB);

  if (updateOps.length > 0) {
    await Detection.bulkWrite(updateOps);
  }

  if (limitedCreates.length > 0) {
    await Detection.insertMany(limitedCreates);
  }

  return {
    createdDetections: limitedCreates.length,
    updatedDetections: updateOps.length
  };
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
    return {
      createdDetections: 0,
      updatedDetections: 0
    };
  }

  const comparison = await getComparisonResult(asset, referenceFilePath, candidatePool);
  const matches = collapseMatches(asset._id, candidatePool, comparison);
  return persistDetections(asset._id, matches);
}

async function runDetectionForAssets(assetIds) {
  const uniqueAssetIds = [...new Set(assetIds)];
  if (uniqueAssetIds.length === 0) {
    return [];
  }

  const queue = [...uniqueAssetIds];
  const results = [];
  const concurrency = Math.max(
    1,
    Math.min(env.detectionBatchConcurrency || 3, uniqueAssetIds.length)
  );

  async function worker() {
    while (queue.length > 0) {
      const assetId = queue.shift();
      if (!assetId) {
        continue;
      }

      try {
        const stats = await runDetectionForAsset(assetId);
        results.push({
          assetId,
          status: "completed",
          ...stats
        });
      } catch (error) {
        results.push({
          assetId,
          status: "failed",
          createdDetections: 0,
          updatedDetections: 0,
          error: error.message
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function toJobResponse(job) {
  return {
    id: job.id,
    type: job.type,
    assetId: job.assetId,
    assetIds: job.assetIds,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdDetections: job.createdDetections,
    updatedDetections: job.updatedDetections,
    totalAssets: job.totalAssets,
    processedAssets: job.processedAssets,
    batchResults: job.batchResults,
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
      const job = jobId ? detectionJobs.get(jobId) : null;
      if (!job) {
        continue;
      }

      job.status = "running";
      job.startedAt = new Date().toISOString();

      try {
        if (job.type === "batch") {
          const batchResults = await runDetectionForAssets(job.assetIds || []);
          job.batchResults = batchResults;
          job.processedAssets = batchResults.length;
          job.createdDetections = batchResults.reduce(
            (sum, item) => sum + (item.createdDetections || 0),
            0
          );
          job.updatedDetections = batchResults.reduce(
            (sum, item) => sum + (item.updatedDetections || 0),
            0
          );

          const failures = batchResults.filter((item) => item.status === "failed");
          if (failures.length > 0) {
            job.error = `${failures.length} asset(s) failed in batch run`;
          }

          if (failures.length === batchResults.length && batchResults.length > 0) {
            job.status = "failed";
          } else {
            job.status = "completed";
          }
        } else {
          const stats = await runDetectionForAsset(job.assetId);
          job.createdDetections = stats.createdDetections;
          job.updatedDetections = stats.updatedDetections;
          job.processedAssets = 1;
          job.status = "completed";
        }
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
  if (pendingJobIds.length >= env.detectionMaxPendingJobs) {
    throw new Error("Detection queue is busy. Please retry shortly.");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    type: "single",
    assetId,
    assetIds: [],
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    createdDetections: 0,
    updatedDetections: 0,
    totalAssets: 1,
    processedAssets: 0,
    batchResults: [],
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

function enqueueBatchDetectionSearch(assetIds) {
  if (pendingJobIds.length >= env.detectionMaxPendingJobs) {
    throw new Error("Detection queue is busy. Please retry shortly.");
  }

  const uniqueAssetIds = [...new Set(assetIds)];
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    type: "batch",
    assetId: null,
    assetIds: uniqueAssetIds,
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    createdDetections: 0,
    updatedDetections: 0,
    totalAssets: uniqueAssetIds.length,
    processedAssets: 0,
    batchResults: [],
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
  enqueueBatchDetectionSearch,
  getDetectionSearchJob
};
