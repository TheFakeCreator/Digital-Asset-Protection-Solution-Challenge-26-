# Team Operating Model

This document defines how 4 developers and 5 project agents collaborate safely during the hackathon.

## 1. Ownership Model

| Person | Primary Area | Primary Agent | Backup Reviewer |
|---|---|---|---|
| Person 1 | Backend API + DB | `@BackendDev` | Person 4 |
| Person 2 | Fingerprinting + Matching | `@PythonWorker` | Person 1 |
| Person 3 | Crawling + Platform Integrations | `@PythonWorker` + `@InfraOps` | Person 2 |
| Person 4 | Frontend Dashboard + UX | `@FrontendDev` | Person 1 |

## 2. Work Unit Rules

- Every code change starts from a GitHub issue.
- One issue maps to one branch and one PR.
- No direct commits to `main`.
- If scope grows, split the issue before coding more.

## 3. Branch Strategy

Use one of these branch names:

- `feat/<issue-number>-short-name`
- `fix/<issue-number>-short-name`
- `chore/<issue-number>-short-name`
- `hotfix/<issue-number>-short-name`

Examples:

- `feat/12-asset-upload-api`
- `fix/27-crawler-timeout`

## 4. Mandatory Sync Cadence

Run sync checks:

- At session start.
- Every 60-90 minutes while coding.
- Before pushing.
- Immediately after teammate PR merges.

Commands:

```bash
git fetch origin
git log --oneline --decorate --max-count=8 origin/main
git rev-list --left-right --count HEAD...origin/main
```

If branch is behind `origin/main`, rebase before opening PR:

```bash
git rebase origin/main
```

## 5. Day-Wise Gate Policy

- Execute tasks in strict ROADMAP day order.
- Do not start Day N+1 implementation until all code-actionable Day N tasks are complete.
- If a dependency forces cross-day work, log the exception in `ROADMAP.md` with reason before implementation.

## 6. Agent Execution Loop (Per Issue)

For every agent-assisted task:

1. Read issue scope and acceptance criteria.
2. Run sync check against `origin/main`.
3. Implement a small batch (30-90 minutes max).
4. Re-run sync check before push.
5. Push and post status in issue with blockers/next step.

## 7. Issue Lifecycle

Use labels/status flow:

- `todo`
- `in-progress`
- `in-review`
- `done`

If blocked more than 30 minutes:

1. Create blocker issue using blocker template.
2. Link parent issue.
3. Assign owner and helper.
4. Reduce parent issue scope if needed.

## 8. If Something Goes Off

If branch breaks or conflicts become risky:

1. Stop adding new commits to the broken branch.
2. Open blocker issue immediately.
3. Create rescue branch from latest `origin/main`.
4. Cherry-pick only known-good commits.
5. Pair review before merge.

Rescue commands:

```bash
git fetch origin
git switch -c rescue/<issue-number>-short-name origin/main
git cherry-pick <safe-commit-sha>
```

## 9. Day 1 Issue Split (Start Now)

Create these first issues now:

1. Backend skeleton + health route (Person 1, `@BackendDev`)
2. Fingerprint service CLI + JSON output contract (Person 2, `@PythonWorker`)
3. Crawler worker scaffold + retry policy (Person 3, `@PythonWorker`)
4. Frontend app shell + upload page skeleton (Person 4, `@FrontendDev`)
5. Docs and workflow guardrails validation (Person 1 + Person 4, `@ProjectManager`)
