const crypto = require("crypto");

const { Asset, Detection } = require("../models");

const detectionJobs = new Map();
const pendingJobIds = [];
let isQueueRunning = false;

function hashToInt(input) {
  const digest = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(digest.slice(0, 8), 16);
}

function createCandidateDetections(asset) {
  const seedInput = `${asset.fingerprintHash || asset._id.toString()}::${asset.name}`;
  const seed = hashToInt(seedInput);

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

  const slugBase = `${asset._id.toString().slice(-6)}${(asset.fingerprintHash || "").slice(0, 6)}`;

  return Array.from({ length: 3 }).map((_, index) => {
    const platform = platformConfigs[(seed + index) % platformConfigs.length];
    const confidence = 60 + ((seed >> (index * 4)) % 41);
    const status = confidence >= 85 ? "confirmed" : "pending";
    const suffix = `${slugBase}${index}`;

    return {
      platform: platform.platform,
      url: platform.buildUrl(suffix),
      confidence,
      status,
      dateFound: new Date(Date.now() - index * 60 * 60 * 1000)
    };
  });
}

async function runDetectionForAsset(assetId) {
  const asset = await Asset.findById(assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  const candidates = createCandidateDetections(asset);
  const existing = await Detection.find({ assetId: asset._id }).select({ url: 1, _id: 0 }).lean();
  const existingUrls = new Set(existing.map((item) => item.url));

  const newDetections = candidates
    .filter((candidate) => !existingUrls.has(candidate.url))
    .map((candidate) => ({
      ...candidate,
      assetId: asset._id
    }));

  if (newDetections.length === 0) {
    return 0;
  }

  await Detection.insertMany(newDetections);
  return newDetections.length;
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