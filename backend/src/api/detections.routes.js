const express = require("express");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const { z } = require("zod");

const { Asset, Detection } = require("../models");
const { AppError } = require("../errors/app-error");
const { uploadMedia } = require("../middleware/upload-media");
const { compareImageBatch } = require("../services/detection.bridge");
const { generateFingerprint } = require("../services/fingerprint.bridge");
const {
  enqueueDetectionSearch,
  enqueueBatchDetectionSearch,
  getDetectionSearchJob
} = require("../services/detection-search.service");

const router = express.Router();

const listDetectionsQuerySchema = z.object({
  asset_id: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const batchDetectionSearchBodySchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(25)
});

const previewCompareBodySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(100).default(85)
});

function parseOrThrow(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new AppError(message || "Invalid request payload", 400, "VALIDATION_ERROR");
  }
  return parsed.data;
}

function assertDatabaseConnected() {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError(
      "Database is not connected. Configure MONGODB_URI and retry.",
      503,
      "DATABASE_UNAVAILABLE"
    );
  }
}

async function safeUnlink(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

router.post(
  "/preview-compare",
  uploadMedia.fields([
    { name: "reference", maxCount: 1 },
    { name: "candidate", maxCount: 1 }
  ]),
  async (req, res, next) => {
    let uploadedPaths = [];

    try {
      const files = req.files && typeof req.files === "object" ? req.files : {};
      const referenceFile = Array.isArray(files.reference) ? files.reference[0] : null;
      const candidateFile = Array.isArray(files.candidate) ? files.candidate[0] : null;

      if (!referenceFile || !candidateFile) {
        throw new AppError(
          "Both reference and candidate images are required",
          400,
          "FILE_REQUIRED"
        );
      }

      uploadedPaths = [referenceFile.path, candidateFile.path].filter(Boolean);

      const { threshold } = parseOrThrow(previewCompareBodySchema, req.body);

      const [referenceFingerprint, candidateFingerprint, comparison] = await Promise.all([
        generateFingerprint(referenceFile.path),
        generateFingerprint(candidateFile.path),
        compareImageBatch(referenceFile.path, [candidateFile.path], threshold)
      ]);

      const firstResult = Array.isArray(comparison.results) ? comparison.results[0] : null;

      res.status(200).json({
        success: true,
        data: {
          reference: {
            fileName: referenceFile.originalname,
            hash: referenceFingerprint.hash,
            algorithm: referenceFingerprint.algorithm
          },
          candidate: {
            fileName: candidateFile.originalname,
            hash: candidateFingerprint.hash,
            algorithm: candidateFingerprint.algorithm
          },
          comparison: {
            algorithm: comparison.algorithm,
            threshold: comparison.threshold,
            referenceVariants: comparison.reference?.variants || [],
            result: firstResult
          }
        }
      });
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(uploadedPaths.map((filePath) => safeUnlink(filePath)));
    }
  }
);

router.post("/search/batch", async (req, res, next) => {
  try {
    assertDatabaseConnected();

    const { assetIds } = parseOrThrow(batchDetectionSearchBodySchema, req.body);
    const uniqueAssetIds = [...new Set(assetIds)];

    for (const assetId of uniqueAssetIds) {
      if (!mongoose.isValidObjectId(assetId)) {
        throw new AppError(`Invalid asset id: ${assetId}`, 400, "INVALID_ASSET_ID");
      }
    }

    const assets = await Asset.find({ _id: { $in: uniqueAssetIds } }).select({ _id: 1 }).lean();
    if (assets.length !== uniqueAssetIds.length) {
      throw new AppError("One or more assets were not found", 404, "ASSET_NOT_FOUND");
    }

    const job = enqueueBatchDetectionSearch(uniqueAssetIds);

    res.status(202).json({
      success: true,
      data: {
        job
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/search/:assetId", async (req, res, next) => {
  try {
    assertDatabaseConnected();

    const { assetId } = req.params;
    if (!mongoose.isValidObjectId(assetId)) {
      throw new AppError("Invalid asset id", 400, "INVALID_ASSET_ID");
    }

    const asset = await Asset.findById(assetId).select({ _id: 1 });
    if (!asset) {
      throw new AppError("Asset not found", 404, "ASSET_NOT_FOUND");
    }

    const job = enqueueDetectionSearch(asset._id.toString());

    res.status(202).json({
      success: true,
      data: {
        job
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:jobId", (req, res, next) => {
  try {
    const job = getDetectionSearchJob(req.params.jobId);
    if (!job) {
      throw new AppError("Detection job not found", 404, "DETECTION_JOB_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    assertDatabaseConnected();

    const { asset_id: assetId, page, limit } = parseOrThrow(listDetectionsQuerySchema, req.query);

    const filter = {};
    if (assetId) {
      if (!mongoose.isValidObjectId(assetId)) {
        throw new AppError("Invalid asset id", 400, "INVALID_ASSET_ID");
      }
      filter.assetId = assetId;
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Detection.find(filter)
        .sort({ dateFound: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("assetId", "name creator eventDate"),
      Detection.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        items,
        page,
        limit,
        total
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    assertDatabaseConnected();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError("Invalid detection id", 400, "INVALID_DETECTION_ID");
    }

    const detection = await Detection.findById(id).populate("assetId", "name creator eventDate");
    if (!detection) {
      throw new AppError("Detection not found", 404, "DETECTION_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: detection
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;