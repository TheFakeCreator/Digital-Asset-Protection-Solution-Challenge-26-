function errorHandler(err, req, res, _next) {
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
