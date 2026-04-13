const express = require("express");
const cors = require("cors");

const env = require("./config/env");
const assetRoutes = require("./api/assets.routes");
const detectionRoutes = require("./api/detections.routes");
const healthRoutes = require("./api/health.routes");
const { notFound } = require("./middleware/not-found");
const { errorHandler } = require("./middleware/error-handler");

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(env.uploadDir));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: "digital-asset-protection-backend",
      message: "Backend is running"
    }
  });
});

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/detections", detectionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
