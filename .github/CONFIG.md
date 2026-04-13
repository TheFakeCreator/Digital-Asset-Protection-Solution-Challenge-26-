---
title: "Setup Configuration"
description: "Project configuration and team guidelines for Solution Challenge 2026"
---

# Solution Challenge 2026 - Setup Configuration

This document captures the finalized tech stack and team guidelines for the hackathon.

## Tech Stack (Final Decision)

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Backend API** | Node.js | ≥18 LTS | Fast, async-native, unified JS ecosystem |
| **Backend Framework** | Express.js | Latest | Lightweight, middleware-based, battle-tested |
| **Database** | MongoDB | - | Flexible schema for MVP iteration, JSON-native |
| **Cache Layer** | Redis | - | Optional for MVP, included in docker-compose |
| **Frontend Framework** | Next.js | Latest | SSR, built-in optimizations, perfect for dashboards |
| **Frontend UI** | Tailwind CSS | Latest | Pre-installed with Next.js, utility-first CSS |
| **Language Enhancements** | TypeScript | Latest | Type safety for large codebases |
| **Package Manager** | pnpm | Latest | Fast, efficient, prevents npm woes |
| **Specialized Tasks** | Python 3.9+ | - | ImageHash, OpenCV, BeautifulSoup for processing |
| **Cloud Provider** | Google Cloud | - | Provided hackathon credits |
| **Containerization** | Docker + Compose | Latest | Local dev + deployment consistency |

## Key Rules & Constraints

### Dependency Management (NON-NEGOTIABLE)
- **ALWAYS** use `pnpm` CLI: `pnpm add <package>`
- **NEVER** manually edit `package.json`
- **NEVER** use `npm install` or `npm add`
- **ALWAYS** commit `pnpm-lock.yaml` to git
- Latest versions ONLY - no version pinning

### Next.js Frontend
- Create ONCE with: `pnpm create next-app@latest frontend --typescript --tailwind --app`
- Tailwind CSS is **pre-installed** - do NOT install separately
- If it breaks, Tailwind was installed separately (wrong!)
- Use Next.js App Router, not Pages Router

### Python Environment
- Create virtual environment: `python -m venv venv`
- Activate and install packages via `pip install`
- Store in `/backend/python/`
- Called from Node.js via `child_process.spawn()`

### Documentation Sync
- Update PLAN.md and ROADMAP.md with code changes
- Run `bash scripts/update-docs.sh` to validate
- Timestamps auto-updated
- Pre-commit hook prevents bad docs from being committed

### Google Cloud Usage
- Use provided credits for deployment
- Service account JSON stored in `.env` (path reference)
- Never commit credentials directly
- Deploy frontend & backend to Cloud Run

## Team Structure

| Role | Person | Responsibility | Key Files |
|------|--------|-----------------|-----------|
| **Backend Lead** | Person 1 | Node.js API, MongoDB, integration | `backend/src/` |
| **Fingerprinting** | Person 2 | Image processing, algorithms | `backend/python/fingerprint_service.py` |
| **Web Crawler** | Person 3 | Platform integration, scraping | `backend/python/crawler_worker.py` |
| **Frontend Dev** | Person 4 | Next.js dashboard, UX | `frontend/` |

## Critical File Locations

```
PROJECT_ROOT
├── PLAN.md                          ← Strategy & architecture
├── ROADMAP.md                       ← Daily execution (updated each day)
├── SETUP_COMPLETE.md                ← This file's summary
├── README.md                        ← Getting started guide
├── .github/
│   ├── AGENTS.md                    ← Workspace agent routing
│   ├── agents/*.agent.md            ← Executable custom agents
│   ├── instructions/*.instructions.md ← On-demand project instructions
│   ├── skills/<name>/SKILL.md       ← Modular Copilot skills
│   ├── prompts/*.prompt.md          ← Prompt library
│   └── hooks/*.json                 ← Copilot hook configurations
├── scripts/
│   ├── install-deps.sh              ← One-time setup
│   └── update-docs.sh               ← Documentation validation
├── .githooks/pre-commit             ← Git hook validation
├── backend/                         ← Node.js backend
│   ├── src/                         ← Express app code
│   ├── python/                      ← Python workers
│   └── package.json                 ← Managed by pnpm ONLY
├── frontend/                        ← Next.js frontend
│   ├── app/                         ← App Router pages
│   ├── components/                  ← React components
│   └── package.json                 ← Managed by pnpm ONLY
├── .env.example                     ← Environment template
├── .gitignore                       ← Ignore rules (keeps pnpm-lock.yaml)
└── docker-compose.yml               ← Local services
```

## Package Installation Commands

### Backend (Node.js)
```bash
pnpm add express dotenv cors mongoose redis
pnpm add -D nodemon @types/node typescript ts-node
```

### Frontend (Next.js)
```bash
# ONE TIME - during creation
pnpm create next-app@latest frontend --typescript --tailwind --app

# If needed later
pnpm add <package>
pnpm add -D <dev-package>
```

### Python
```bash
# One time
python -m venv venv
source venv/bin/activate

# Install packages
pip install pillow imagehash opencv-python requests beautifulsoup4 selenium
```

## Development Commands

### Backend
```bash
cd backend
pnpm run dev           # Start with hot-reload
pnpm run build        # Compile for production
pnpm run test         # Run tests
```

### Frontend
```bash
cd frontend
pnpm run dev          # Start Next.js dev server
pnpm run build        # Build for production
pnpm run start        # Start production server
pnpm run lint         # Run ESLint
```

### Services
```bash
docker-compose up -d      # Start MongoDB, Redis
docker-compose ps         # Check status
docker-compose logs -f    # View logs
docker-compose down       # Stop all services
```

## Documentation Update Workflow

1. **After code changes:** Update relevant PLAN.md or ROADMAP.md section
2. **Daily end-of-day:** Run `bash scripts/update-docs.sh`
3. **Before commit:** Auto-validated by pre-commit hook
4. **Status tracking:** Update ROADMAP.md "Status" section

## AI Agent Availability

Use these agents for help (they understand full project context):

- **@BackendDev** - Node.js, Express, MongoDB, API design
- **@FrontendDev** - Next.js, React, Tailwind, UX
- **@PythonWorker** - Fingerprinting, image processing, crawling
- **@InfraOps** - Docker, Google Cloud, deployment
- **@ProjectManager** - Documentation, progress tracking

## Common Mistakes (DON'T!)

❌ Use `npm install` → ✅ Use `pnpm add`  
❌ Edit package.json directly → ✅ Use `pnpm add` CLI  
❌ Install Tailwind separately → ✅ Use Next.js create with --tailwind  
❌ Commit .env files → ✅ Use .env.local and .gitignore  
❌ Commit node_modules → ✅ Only commit pnpm-lock.yaml  
❌ Hardcode credentials → ✅ Use environment variables  

## Success Criteria

**Day 1:** ✅ Project initialized, all dependencies installed, team can run locally  
**Day 2:** ✅ Asset upload working, fingerprinting functional  
**Day 3:** ✅ Detection engine foundation, single crawler working  
**Day 5:** ✅ Internal demo - full pipeline MVP working  
**Day 8:** ✅ All features complete, optimization phase  
**Day 10:** ✅ 🏆 Demo day - judges impressed!

## Troubleshooting Quick Links

- **Module not found?** → Run `pnpm install`
- **MongoDB connection error?** → Check docker-compose, .env
- **Tailwind not working?** → Verify Next.js created with --tailwind
- **Python timeout?** → Increase timeout in spawn, profile separately
- **API slow?** → Add MongoDB indexes, check projections

## Getting Started (Day 1)

```bash
# 1. Run setup script
bash scripts/install-deps.sh

# 2. Copy environment
cp .env.example .env.local

# 3. Start services
docker-compose up -d

# 4. Start backend (Terminal 1)
cd backend && pnpm run dev

# 5. Start frontend (Terminal 2)
cd frontend && pnpm run dev

# 6. You're ready to build! 🚀
```

---

**Last Updated:** April 14, 2026  
**Status:** Ready for Execution  
**Next:** Start Day 1 tasks from ROADMAP.md
