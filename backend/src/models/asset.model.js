const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    creator: {
      type: String,
      required: true,
      trim: true
    },
    eventDate: {
      type: Date,
      required: true
    },
    uploadDate: {
      type: Date,
      default: Date.now
    },
    fingerprintHash: {
      type: String,
      index: true,
      default: ""
    },
    originalFileName: {
      type: String,
      default: "",
      trim: true
    },
    mimeType: {
      type: String,
      default: "",
      trim: true
    },
    sizeBytes: {
      type: Number,
      default: 0,
      min: 0
    },
    filePath: {
      type: String,
      default: "",
      trim: true
    },
    fileUrl: {
      type: String,
      default: "",
      trim: true
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active"
    }
  },
  {
    timestamps: true
  }
);

assetSchema.index({ creator: 1, uploadDate: -1 });

module.exports = mongoose.models.Asset || mongoose.model("Asset", assetSchema);
