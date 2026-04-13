const express = require("express");
const cors = require("cors");

const env = require("./config/env");
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
