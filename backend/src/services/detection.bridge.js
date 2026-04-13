const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { AppError } = require("../errors/app-error");

function resolveDetectionScript() {
  const configuredPath = env.pythonDetectionScript || "python/detection_service.py";
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const fromCurrentDir = path.resolve(process.cwd(), configuredPath);
  if (fs.existsSync(fromCurrentDir)) {
    return fromCurrentDir;
  }

  const normalizedBackendRelative = configuredPath.replace(/^backend[\\/]/, "");
  const fromBackendDir = path.resolve(process.cwd(), normalizedBackendRelative);
  if (fs.existsSync(fromBackendDir)) {
    return fromBackendDir;
  }

  const fromRepoRoot = path.resolve(process.cwd(), "..", configuredPath);
  if (fs.existsSync(fromRepoRoot)) {
    return fromRepoRoot;
  }

  return fromCurrentDir;
}

function buildPythonCandidates() {
  const workspaceVenvPython = path.resolve(process.cwd(), "..", ".venv", "Scripts", "python.exe");

  const candidates = [
    { command: env.pythonExecutable, prefixArgs: [] },
    { command: workspaceVenvPython, prefixArgs: [] },
    { command: "python", prefixArgs: [] },
    { command: "python3", prefixArgs: [] },
    { command: "py", prefixArgs: ["-3"] },
    { command: "c:/python314/python.exe", prefixArgs: [] }
  ];

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.command}::${candidate.prefixArgs.join(" ")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseDetectionPayload(parsed) {
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error("Missing results array in detection response");
  }

  for (const result of parsed.results) {
    if (!result.image_path || typeof result.similarity_score !== "number") {
      throw new Error("Invalid detection result item");
    }
  }

  return parsed;
}

function runDetectionWithCandidate(candidate, scriptPath, referenceImagePath, candidateImagePaths, threshold) {
  return new Promise((resolve, reject) => {
    const timeoutMs = env.pythonBridgeTimeoutMs || 30000;
    const args = [
      ...candidate.prefixArgs,
      scriptPath,
      "--reference",
      referenceImagePath,
      "--threshold",
      String(threshold),
      ...candidateImagePaths
    ];

    const pythonProcess = spawn(candidate.command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;

    const timeout = setTimeout(() => {
      didTimeout = true;
      pythonProcess.kill();
    }, timeoutMs);

    pythonProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    pythonProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    pythonProcess.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new AppError(
          `Failed to start '${candidate.command}': ${error.message}`,
          502,
          "DETECTION_PROCESS_ERROR"
        )
      );
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (didTimeout) {
        reject(
          new AppError(
            `Detection process timed out after ${timeoutMs}ms using '${candidate.command}'`,
            504,
            "DETECTION_TIMEOUT"
          )
        );
        return;
      }

      if (code !== 0) {
        reject(
          new AppError(
            `Detection process failed with '${candidate.command}' (code ${code}): ${stderr.trim()}`,
            502,
            "DETECTION_PROCESS_ERROR"
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parseDetectionPayload(parsed));
      } catch (error) {
        reject(
          new AppError(
            `Invalid detection response from '${candidate.command}': ${error.message}`,
            502,
            "DETECTION_PARSE_ERROR"
          )
        );
      }
    });
  });
}

async function compareImageBatch(referenceImagePath, candidateImagePaths, threshold = env.detectionSimilarityThreshold) {
  if (!referenceImagePath) {
    throw new AppError("Reference image path is required", 400, "VALIDATION_ERROR");
  }

  if (!Array.isArray(candidateImagePaths) || candidateImagePaths.length === 0) {
    throw new AppError("At least one candidate image path is required", 400, "VALIDATION_ERROR");
  }

  const scriptPath = resolveDetectionScript();
  const candidates = buildPythonCandidates();

  let lastError;
  for (const candidate of candidates) {
    try {
      return await runDetectionWithCandidate(
        candidate,
        scriptPath,
        referenceImagePath,
        candidateImagePaths,
        threshold
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new AppError("No Python executable candidates were available", 502, "DETECTION_PROCESS_ERROR")
  );
}

module.exports = {
  compareImageBatch
};
