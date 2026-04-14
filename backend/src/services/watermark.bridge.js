const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { AppError } = require("../errors/app-error");

function resolveWatermarkScript() {
  const configuredPath = env.pythonWatermarkScript || "python/robust_watermark.py";
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

function parseGeneratePayload(parsed) {
  if (!parsed || typeof parsed.fingerprint_hex !== "string") {
    throw new Error("Invalid watermark generate response payload");
  }

  return {
    fingerprintHex: parsed.fingerprint_hex,
    framesUsed: Number(parsed.frames_used || 0),
    eccScheme: parsed.ecc_scheme || "",
    encodedBitLength: Number(parsed.encoded_bit_length || 0)
  };
}

function parseDetectPayload(parsed) {
  if (!parsed || typeof parsed.fingerprint !== "string") {
    throw new Error("Invalid watermark detect response payload");
  }

  return {
    fingerprintHex: parsed.fingerprint,
    confidence: Number(parsed.confidence || 0),
    bitErrorRate: Number(parsed.bit_error_rate || 1),
    framesUsed: Number(parsed.frames_used || 0)
  };
}

function runWatermarkWithCandidate(candidate, mode, mediaPath, key, timeoutMs) {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveWatermarkScript();
    const args = [...candidate.prefixArgs, scriptPath, mode, mediaPath];

    if (mode === "detect" || mode === "generate") {
      args.push("--key", key);
    }

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
          "WATERMARK_PROCESS_ERROR"
        )
      );
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (didTimeout) {
        reject(
          new AppError(
            `Watermark process timed out after ${timeoutMs}ms using '${candidate.command}'`,
            504,
            "WATERMARK_TIMEOUT"
          )
        );
        return;
      }

      if (code !== 0) {
        reject(
          new AppError(
            `Watermark process failed with '${candidate.command}' (code ${code}): ${stderr.trim()}`,
            502,
            "WATERMARK_PROCESS_ERROR"
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(mode === "generate" ? parseGeneratePayload(parsed) : parseDetectPayload(parsed));
      } catch (error) {
        reject(
          new AppError(
            `Invalid watermark response from '${candidate.command}': ${error.message}`,
            502,
            "WATERMARK_PARSE_ERROR"
          )
        );
      }
    });
  });
}

async function runWatermark(mode, mediaPath, key = "") {
  const timeoutMs = env.pythonBridgeTimeoutMs || 30000;
  const candidates = buildPythonCandidates();

  let lastError;
  for (const candidate of candidates) {
    try {
      return await runWatermarkWithCandidate(candidate, mode, mediaPath, key, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new AppError("No Python executable candidates were available", 502, "WATERMARK_PROCESS_ERROR")
  );
}

async function generateWatermarkFingerprint(mediaPath, key = "hash-lab-demo-key") {
  return runWatermark("generate", mediaPath, key);
}

async function detectWatermarkFingerprint(mediaPath, key) {
  if (!key || typeof key !== "string") {
    throw new AppError("Watermark key is required", 400, "VALIDATION_ERROR");
  }

  return runWatermark("detect", mediaPath, key.trim());
}

module.exports = {
  generateWatermarkFingerprint,
  detectWatermarkFingerprint
};
