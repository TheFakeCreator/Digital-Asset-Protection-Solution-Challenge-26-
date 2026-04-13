---
name: infra-deployment-guardrails
description: "Configure Docker, cloud deployment, CI/CD, and environment safety for reliable hackathon delivery and rollback-ready operations."
argument-hint: "Describe the failing environment, command output, and deployment target."
---

# Infra Deployment Guardrails

## When To Use
- Dockerfile or docker-compose setup and troubleshooting.
- Cloud Run or related deployment workflows.
- CI/CD pipeline failures and release verification.
- Environment variable and secrets configuration hardening.

## Procedure
1. Isolate boundary of failure: local runtime, CI pipeline, or cloud deployment.
2. Apply minimal configuration changes with clear rollback path.
3. Validate using deterministic commands and health checks.
4. Document deploy and rollback steps with expected outputs.
5. Confirm secrets are never committed or echoed in logs.

## Guardrails
- Favor reproducible scripts over manual one-off commands.
- Keep runtime configuration explicit and environment-specific.
- Prioritize stability over broad infra refactors during delivery windows.
