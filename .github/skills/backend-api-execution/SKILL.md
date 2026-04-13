---
name: backend-api-execution
description: "Build and debug Express plus MongoDB backend APIs with validation, error handling, indexing, and integration-safe changes. Use when implementing endpoints, middleware, services, or API contracts."
argument-hint: "Describe the endpoint or backend bug, affected files, and expected behavior."
---

# Backend API Execution

## When To Use
- Adding or changing backend API endpoints.
- Implementing middleware, input validation, and error handling.
- Optimizing MongoDB query paths and indexes.
- Coordinating backend contracts with frontend or Python services.

## Procedure
1. Inspect existing route, service, model, and response contracts before editing.
2. Implement the smallest backward-compatible code change that solves the task.
3. Add validation and consistent error responses for all new input paths.
4. Verify query performance basics (projections, indexes, pagination limits).
5. Update project docs when API behavior or contracts change.

## Checklist
- `pnpm` CLI used for any dependency changes.
- HTTP status codes and response schema are consistent.
- No internal stack traces are leaked to API clients.
- Changes are reflected in relevant docs where applicable.
