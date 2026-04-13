const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { AppError } = require("../errors/app-error");

function resolveFingerprintScript() {
  const configuredPath = env.pythonFingerprintScript || "python/fingerprint_service.py";
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

function resolveBatchFingerprintScript() {
  const singleScriptPath = resolveFingerprintScript();
  const batchScriptPath = path.resolve(path.dirname(singleScriptPath), "batch_fingerprint_service.py");
  return batchScriptPath;
}

function runScriptWithCandidate(candidate, scriptPath, scriptArgs, timeoutMs, responseParser) {
  return new Promise((resolve, reject) => {
    const args = [...candidate.prefixArgs, scriptPath, ...scriptArgs];
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
          "FINGERPRINT_PROCESS_ERROR"
        )
      );
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (didTimeout) {
        reject(
          new AppError(
            `Fingerprint process timed out after ${timeoutMs}ms using '${candidate.command}'`,
            504,
            "FINGERPRINT_TIMEOUT"
          )
        );
        return;
      }

      if (code !== 0) {
        reject(
          new AppError(
            `Fingerprint process failed with '${candidate.command}' (code ${code}): ${stderr.trim()}`,
            502,
            "FINGERPRINT_PROCESS_ERROR"
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(responseParser(parsed));
      } catch (error) {
        reject(
          new AppError(
            `Invalid fingerprint response from '${candidate.command}': ${error.message}`,
            502,
            "FINGERPRINT_PARSE_ERROR"
          )
        );
      }
    });
  });
}

function parseSingleFingerprintResponse(parsed) {
  if (!parsed.hash || !parsed.algorithm) {
    throw new Error("Missing hash or algorithm in fingerprint response");
  }
  return parsed;
}

function parseBatchFingerprintResponse(parsed) {
  if (!Array.isArray(parsed.results)) {
    throw new Error("Missing batch results array");
  }

  for (const result of parsed.results) {
    if (!result.hash || !result.algorithm || !result.input_path) {
      throw new Error("Invalid batch result item");
    }
  }

  return parsed.results;
}

async function generateFingerprint(imagePath) {
  const scriptPath = resolveFingerprintScript();
  const timeoutMs = env.pythonBridgeTimeoutMs || 30000;
  const candidates = buildPythonCandidates();

  let lastError;
  for (const candidate of candidates) {
    try {
      return await runScriptWithCandidate(
        candidate,
        scriptPath,
        [imagePath],
        timeoutMs,
        parseSingleFingerprintResponse
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new AppError("No Python executable candidates were available", 502, "FINGERPRINT_PROCESS_ERROR")
  );
}

async function generateBatchFingerprints(imagePaths) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new AppError("At least one image path is required", 400, "VALIDATION_ERROR");
  }

  const scriptPath = resolveBatchFingerprintScript();
  const timeoutMs = env.pythonBridgeTimeoutMs || 30000;
  const candidates = buildPythonCandidates();

  let lastError;
  for (const candidate of candidates) {
    try {
      return await runScriptWithCandidate(
        candidate,
        scriptPath,
        imagePaths,
        timeoutMs,
        parseBatchFingerprintResponse
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new AppError("No Python executable candidates were available", 502, "FINGERPRINT_PROCESS_ERROR")
  );
}

module.exports = {
  generateFingerprint,
  generateBatchFingerprints
};
