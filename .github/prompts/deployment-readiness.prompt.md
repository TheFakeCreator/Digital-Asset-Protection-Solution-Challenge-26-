---
name: Deployment Readiness
description: "Prepare and verify deployment readiness for Docker and cloud rollout with rollback-safe steps."
agent: "InfraOps"
argument-hint: "Describe target environment, current failure, and deployment deadline or constraints."
---
Prepare this project for a reliable deployment run.

Requirements:
- Verify environment variables and secrets handling.
- Check Docker and runtime configuration.
- List pre-deploy checks and rollback path.
- Keep commands deterministic and reproducible.

Output format:
1. Readiness checks
2. Required fixes
3. Deploy steps
4. Rollback steps
