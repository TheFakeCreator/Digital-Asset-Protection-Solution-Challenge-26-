const mongoose = require("mongoose");

const detectionSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true
    },
    platform: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    dateFound: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "dismissed"],
      default: "pending"
    }
  },
  {
    timestamps: true
  }
);

detectionSchema.index({ platform: 1, dateFound: -1 });
detectionSchema.index({ confidence: -1 });

module.exports =
  mongoose.models.Detection || mongoose.model("Detection", detectionSchema);
