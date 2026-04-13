const fs = require("fs");
const path = require("path");
const multer = require("multer");

const env = require("../config/env");
const { AppError } = require("../errors/app-error");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, env.uploadDir);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    callback(null, `${suffix}${ext}`);
  }
});

function fileFilter(_req, file, callback) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    callback(
      new AppError(
        `Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif`,
        400,
        "INVALID_FILE_TYPE"
      )
    );
    return;
  }

  callback(null, true);
}

const uploadMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024
  }
});

module.exports = {
  uploadMedia,
  allowedMimeTypes: Array.from(allowedMimeTypes)
};
