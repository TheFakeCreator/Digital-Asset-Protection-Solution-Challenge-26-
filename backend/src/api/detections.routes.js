const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");

const { Asset, Detection } = require("../models");
const { AppError } = require("../errors/app-error");
const {
  enqueueDetectionSearch,
  getDetectionSearchJob
} = require("../services/detection-search.service");

const router = express.Router();

const listDetectionsQuerySchema = z.object({
  asset_id: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
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