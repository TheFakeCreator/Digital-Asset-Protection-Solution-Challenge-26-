const express = require("express");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const path = require("path");
const { z } = require("zod");

const { Asset, Fingerprint } = require("../models");
const { AppError } = require("../errors/app-error");
const { uploadMedia } = require("../middleware/upload-media");
const { generateFingerprint, generateBatchFingerprints } = require("../services/fingerprint.bridge");

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

const batchFingerprintSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(25)
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

function ensureDatabaseConnected(_req, _res, next) {
  try {
    assertDatabaseConnected();
    next();
  } catch (error) {
    next(error);
  }
}

function toPublicUploadUrl(file) {
  return `/uploads/${file.filename}`;
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

router.post("/", ensureDatabaseConnected, uploadMedia.single("media"), async (req, res, next) => {
  try {
    const payload = parseOrThrow(createAssetSchema, req.body);

    if (!req.file) {
      throw new AppError("Media file is required", 400, "FILE_REQUIRED");
    }

    const relativePath = path
      .relative(process.cwd(), req.file.path)
      .split(path.sep)
      .join("/");

    const fingerprint = await generateFingerprint(req.file.path);

    const asset = await Asset.create({
      ...payload,
      fingerprintHash: fingerprint.hash,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      filePath: relativePath,
      fileUrl: toPublicUploadUrl(req.file)
    });

    try {
      await Fingerprint.create({
        assetId: asset._id,
        hashValue: fingerprint.hash,
        algorithm: fingerprint.algorithm
      });
    } catch (error) {
      await Asset.findByIdAndDelete(asset._id);
      await safeUnlink(req.file.path);
      throw new AppError(
        `Failed to persist fingerprint metadata: ${error.message}`,
        500,
        "FINGERPRINT_PERSISTENCE_ERROR"
      );
    }

    res.status(201).json({
      success: true,
      data: {
        asset,
        fingerprint
      }
    });
  } catch (error) {
    if (req.file && error.code !== "FINGERPRINT_PERSISTENCE_ERROR") {
      await safeUnlink(req.file.path);
    }
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

router.post("/fingerprints/batch", async (req, res, next) => {
  try {
    const payload = parseOrThrow(batchFingerprintSchema, req.body);
    assertDatabaseConnected();

    const uniqueAssetIds = [...new Set(payload.assetIds)];
    const invalidAssetId = uniqueAssetIds.find((id) => !mongoose.isValidObjectId(id));
    if (invalidAssetId) {
      throw new AppError(`Invalid asset id: ${invalidAssetId}`, 400, "INVALID_ASSET_ID");
    }

    const assets = await Asset.find({
      _id: {
        $in: uniqueAssetIds
      }
    });

    const assetsById = new Map(assets.map((asset) => [String(asset._id), asset]));
    const missingAssetIds = uniqueAssetIds.filter((id) => !assetsById.has(id));
    if (missingAssetIds.length > 0) {
      throw new AppError(
        `Asset not found: ${missingAssetIds.join(", ")}`,
        404,
        "ASSET_NOT_FOUND"
      );
    }

    const assetFiles = [];
    for (const assetId of uniqueAssetIds) {
      const asset = assetsById.get(assetId);
      if (!asset.filePath) {
        throw new AppError(
          `Asset ${assetId} does not have a stored file path`,
          409,
          "ASSET_FILE_PATH_MISSING"
        );
      }

      const absoluteFilePath = path.isAbsolute(asset.filePath)
        ? asset.filePath
        : path.resolve(process.cwd(), asset.filePath);

      try {
        await fs.access(absoluteFilePath);
      } catch (_error) {
        throw new AppError(
          `Asset file does not exist for ${assetId}`,
          404,
          "ASSET_FILE_NOT_FOUND"
        );
      }

      assetFiles.push({
        asset,
        absoluteFilePath
      });
    }

    const fingerprints = await generateBatchFingerprints(
      assetFiles.map((item) => item.absoluteFilePath)
    );

    if (fingerprints.length !== assetFiles.length) {
      throw new AppError(
        "Batch fingerprint result count does not match requested assets",
        502,
        "FINGERPRINT_COUNT_MISMATCH"
      );
    }

    const now = new Date();

    await Promise.all([
      Asset.bulkWrite(
        assetFiles.map((item, index) => ({
          updateOne: {
            filter: { _id: item.asset._id },
            update: {
              $set: {
                fingerprintHash: fingerprints[index].hash
              }
            }
          }
        }))
      ),
      Fingerprint.bulkWrite(
        assetFiles.map((item, index) => ({
          updateOne: {
            filter: {
              assetId: item.asset._id,
              algorithm: fingerprints[index].algorithm
            },
            update: {
              $set: {
                hashValue: fingerprints[index].hash,
                createdAt: now
              }
            },
            upsert: true
          }
        }))
      )
    ]);

    res.status(200).json({
      success: true,
      data: {
        count: fingerprints.length,
        results: assetFiles.map((item, index) => ({
          assetId: item.asset._id,
          hash: fingerprints[index].hash,
          algorithm: fingerprints[index].algorithm,
          inputPath: fingerprints[index].input_path
        }))
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
