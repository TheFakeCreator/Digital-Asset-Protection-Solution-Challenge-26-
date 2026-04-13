---
name: python-fingerprinting-crawling
description: "Implement and debug Python fingerprinting and crawler workers, including JSON bridge contracts with Node.js and reliability safeguards."
argument-hint: "Describe the Python script, input sample, and observed failure or expected output."
---

# Python Fingerprinting And Crawling

## When To Use
- Fingerprint generation or image similarity matching work.
- Crawler collection, parsing, retry, and rate-limit logic.
- Node.js to Python bridge reliability and timeout handling.
- Diagnosing malformed stdout/stderr or JSON contract failures.

## Procedure
1. Reproduce behavior with representative inputs and expected outputs.
2. Ensure script outputs valid JSON for machine consumption.
3. Add timeout/retry handling for long-running or flaky operations.
4. Preserve bridge compatibility with backend caller expectations.
5. Log actionable errors without exposing sensitive data.

## Bridge Contract Rules
- JSON output goes to stdout.
- Human-readable diagnostics go to stderr.
- Non-zero exit codes represent execution failure.
