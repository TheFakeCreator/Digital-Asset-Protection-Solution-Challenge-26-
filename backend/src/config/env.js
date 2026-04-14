const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const configuredUploadDir = process.env.UPLOAD_DIR || "uploads";
const resolvedUploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(process.cwd(), configuredUploadDir);

const configuredCrawlerOutputDir = process.env.CRAWLER_OUTPUT_DIR || "data/crawled/twitter";
const resolvedCrawlerOutputDir = path.isAbsolute(configuredCrawlerOutputDir)
  ? configuredCrawlerOutputDir
  : path.resolve(process.cwd(), configuredCrawlerOutputDir);

module.exports = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  uploadDir: resolvedUploadDir,
  crawlerOutputDir: resolvedCrawlerOutputDir,
  redisUrl: process.env.REDIS_URL || "",
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 10),
  pythonExecutable: process.env.PYTHON_EXECUTABLE || "python",
  hasCustomPythonExecutable: Boolean(process.env.PYTHON_EXECUTABLE),
  pythonFingerprintScript:
    process.env.PYTHON_FINGERPRINT_SCRIPT || "python/fingerprint_service.py",
  pythonDetectionScript:
    process.env.PYTHON_DETECTION_SCRIPT || "python/detection_service.py",
  pythonWatermarkScript:
    process.env.PYTHON_WATERMARK_SCRIPT || "python/robust_watermark.py",
  pythonBridgeTimeoutMs: Number(process.env.PYTHON_BRIDGE_TIMEOUT_MS || 30000),
  detectionSimilarityThreshold: Number(process.env.DETECTION_SIMILARITY_THRESHOLD || 85),
  detectionCacheTtlSeconds: Number(process.env.DETECTION_CACHE_TTL_SECONDS || 900),
  detectionMaxPendingJobs: Number(process.env.DETECTION_MAX_PENDING_JOBS || 100),
  detectionBatchConcurrency: Number(process.env.DETECTION_BATCH_CONCURRENCY || 3)
};
