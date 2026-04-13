---
description: "Use when implementing or reviewing project code to enforce hackathon standards: pnpm-only dependency management, Node plus MongoDB plus Next.js stack alignment, Python bridge safety, and documentation synchronization."
---
# Hackathon Standards

## Dependency Rules
- Use `pnpm` CLI for JavaScript and TypeScript dependencies.
- Do not manually edit dependency versions in `package.json`.

## Stack Boundaries
- Backend: Node.js + Express + MongoDB.
- Frontend: Next.js App Router + Tailwind CSS.
- Python: fingerprinting and crawler workers, integrated through JSON contracts.

## Quality Rules
- Validate inputs and return consistent error responses.
- Do not expose secrets or internal stack traces.
- Preserve behavior unless a task explicitly requires a change.

## Documentation Rules
- Keep `PLAN.md`, `ROADMAP.md`, and setup docs aligned with meaningful implementation changes.
- Prefer concise, factual updates over long narrative text.
