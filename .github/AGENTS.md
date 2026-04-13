# Solution Challenge 2026 Workspace Agent Guide

This repository uses executable custom agents in `.github/agents/*.agent.md`.

## Available Agents

- `BackendDev` for Node.js backend APIs, middleware, and MongoDB modeling.
- `FrontendDev` for Next.js App Router UI, Tailwind UX, and frontend performance.
- `PythonWorker` for fingerprinting, crawling, and Python bridge tasks.
- `InfraOps` for Docker, deployment, CI/CD, and cloud environment setup.
- `ProjectManager` for roadmap updates, milestone tracking, and documentation sync.

## Routing Rules

- Pick the narrowest agent that fully matches the task domain.
- For mixed-domain work, split into ordered phases and hand off to the next agent after each phase.
- Keep changes small and scoped to the current request.

## Team Sync Protocol

- Every agent-assisted task should map to one GitHub issue.
- Work on one issue branch at a time (`feat/<issue>-...`, `fix/<issue>-...`, etc.).
- Run a remote sync check at start, every 60-90 minutes, and before push.
- If teammate changes conflict with your branch, stop and rebase before continuing.
- If blocked more than 30 minutes, open a blocker issue and link the parent issue.

## Project Guardrails

- Use `pnpm` CLI for JavaScript/TypeScript dependencies; do not hand-edit `package.json` versions.
- Keep `PLAN.md` and `ROADMAP.md` aligned with significant implementation changes.
- Treat `README.md` as the source of setup truth for new contributors.

## Copilot Customization Map

- Prompt templates: `.github/prompts/*.prompt.md`
- On-demand instructions: `.github/instructions/*.instructions.md`
- Reusable skills: `.github/skills/<name>/SKILL.md`
- Runtime hooks: `.github/hooks/*.json` (scripts in `scripts/hooks/`)
