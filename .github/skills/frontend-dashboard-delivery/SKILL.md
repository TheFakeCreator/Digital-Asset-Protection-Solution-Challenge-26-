---
name: frontend-dashboard-delivery
description: "Build and debug Next.js App Router dashboard features with Tailwind, clear server/client component boundaries, and reliable data-fetching patterns."
argument-hint: "Describe the page/component, UX issue, and acceptance criteria."
---

# Frontend Dashboard Delivery

## When To Use
- Building dashboard pages, forms, and data views.
- Fixing rendering, hydration, or routing issues in App Router.
- Improving responsiveness, accessibility, or loading/error states.
- Stabilizing client polling or server-rendered data behavior.

## Procedure
1. Identify route boundaries and whether each component should be server or client.
2. Implement focused UI/logic changes with reusable components.
3. Add explicit loading, empty, and error states for user-visible flows.
4. Verify responsive behavior and semantic accessibility basics.
5. Run lint/build checks when available and summarize residual risks.

## Guardrails
- Do not reinstall Tailwind separately in this workspace.
- Prefer server components by default, client components only for interactivity.
- Keep API data contracts aligned with backend responses.
