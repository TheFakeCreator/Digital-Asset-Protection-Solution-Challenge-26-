const mongoose = require("mongoose");

const fingerprintSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true
    },
    hashValue: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    algorithm: {
      type: String,
      required: true,
      trim: true,
      default: "phash"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

fingerprintSchema.index({ assetId: 1, algorithm: 1 }, { unique: true });

module.exports =
  mongoose.models.Fingerprint || mongoose.model("Fingerprint", fingerprintSchema);
