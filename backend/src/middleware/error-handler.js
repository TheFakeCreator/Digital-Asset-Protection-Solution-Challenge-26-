const multer = require("multer");

function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const code = err.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "FILE_UPLOAD_ERROR";
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file exceeds the configured size limit"
        : err.message;

    res.status(400).json({
      success: false,
      error: {
        code,
        message
      }
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_SERVER_ERROR";
  const message = err.message || "Something went wrong";

  if (statusCode >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl} -> ${code}`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

module.exports = {
  errorHandler
};
