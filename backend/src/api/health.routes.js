const express = require("express");

const router = express.Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    }
  });
});

module.exports = router;
