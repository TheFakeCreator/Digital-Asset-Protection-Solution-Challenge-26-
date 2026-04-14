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
    imageSignature: {
      type: String,
      trim: true,
      default: "",
      index: true
    },
    sourceLocalPath: {
      type: String,
      trim: true,
      default: ""
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
    },
    occurrenceCount: {
      type: Number,
      min: 1,
      default: 1
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    history: [
      {
        url: {
          type: String,
          trim: true,
          default: ""
        },
        platform: {
          type: String,
          trim: true,
          lowercase: true,
          default: ""
        },
        sourceLocalPath: {
          type: String,
          trim: true,
          default: ""
        },
        similarityScore: {
          type: Number,
          min: 0,
          max: 100,
          default: 0
        },
        dateFound: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

detectionSchema.index({ platform: 1, dateFound: -1 });
detectionSchema.index({ confidence: -1 });
detectionSchema.index({ assetId: 1, imageSignature: 1 });

module.exports =
  mongoose.models.Detection || mongoose.model("Detection", detectionSchema);
