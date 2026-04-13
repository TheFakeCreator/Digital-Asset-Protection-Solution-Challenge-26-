#!/usr/bin/env node

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function pickFirst(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let found = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) {
        found = false;
        break;
      }
      cur = cur[part];
    }
    if (found) {
      return cur;
    }
  }
  return undefined;
}

(async () => {
  const raw = await readStdin();
  let payload = {};

  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const toolName =
    pickFirst(payload, [
      "toolName",
      "tool.name",
      "toolCall.name",
      "hookData.toolName",
      "hookInput.toolName"
    ]) || "";

  const toolInput =
    pickFirst(payload, [
      "toolInput",
      "tool.input",
      "toolCall.input",
      "hookData.toolInput",
      "hookInput.toolInput"
    ]) || {};

  let command = "";
  if (typeof toolInput === "string") {
    command = toolInput;
  } else if (toolInput && typeof toolInput === "object") {
    if (typeof toolInput.command === "string") {
      command = toolInput.command;
    } else if (typeof toolInput.input === "string") {
      command = toolInput.input;
    } else if (Array.isArray(toolInput.args)) {
      command = toolInput.args.join(" ");
    }
  }

  const candidate = `${toolName} ${command}`.trim();

  const blockedPatterns = [
    /git\s+reset\s+--hard/i,
    /git\s+checkout\s+--\s+/i,
    /git\s+clean\s+-fdx/i,
    /\brm\s+-rf\b/i,
    /\bdel\s+\/f\s+\/s\s+\/q\b/i
  ];

  const matchedPattern = blockedPatterns.find((pattern) => pattern.test(candidate));

  if (matchedPattern) {
    const denyResponse = {
      continue: true,
      stopReason: "Blocked by workspace safety hook.",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Potentially destructive command detected: ${candidate}`
      }
    };
    process.stdout.write(JSON.stringify(denyResponse));
    return;
  }

  const allowResponse = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "No destructive command pattern detected."
    }
  };

  process.stdout.write(JSON.stringify(allowResponse));
})();
