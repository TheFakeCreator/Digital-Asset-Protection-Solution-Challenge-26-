const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");

const { Asset } = require("../models");
const { AppError } = require("../errors/app-error");

const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  creator: z.string().trim().min(1).max(120),
  eventDate: z.coerce.date(),
  fingerprintHash: z.string().trim().max(256).optional().default("")
});

const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const router = express.Router();

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

router.post("/", async (req, res, next) => {
  try {
    const payload = parseOrThrow(createAssetSchema, req.body);
    assertDatabaseConnected();
    const asset = await Asset.create(payload);

    res.status(201).json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = parseOrThrow(listAssetsQuerySchema, req.query);
    assertDatabaseConnected();
    const skip = (page - 1) * limit;

    const [assets, total] = await Promise.all([
      Asset.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Asset.countDocuments({})
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: assets,
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
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError("Invalid asset id", 400, "INVALID_ASSET_ID");
    }

    assertDatabaseConnected();

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      throw new AppError("Asset not found", 404, "ASSET_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: asset
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError("Invalid asset id", 400, "INVALID_ASSET_ID");
    }

    assertDatabaseConnected();

    const deletedAsset = await Asset.findByIdAndDelete(req.params.id);
    if (!deletedAsset) {
      throw new AppError("Asset not found", 404, "ASSET_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: {
        id: deletedAsset._id,
        status: "deleted"
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
