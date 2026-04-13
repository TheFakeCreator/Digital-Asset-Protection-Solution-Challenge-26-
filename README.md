# Digital Asset Protection - Sports Media Integrity Solution

**Solution Challenge 2026 Hackathon Submission**

A scalable system to identify, track, and flag unauthorized use or misappropriation of official sports media across the internet. Enable organizations to proactively authenticate their digital assets and detect anomalies in content propagation in near real-time.

## 🎯 Quick Start

### Prerequisites
- **Node.js** 18+ (LTS recommended)
- **pnpm** (package manager) - install globally with `npm install -g pnpm`
- **Python** 3.9+ (for fingerprinting and crawling)
- **Docker** & **Docker Compose** (for local development)

### One-Time Setup (Day 1)

```bash
# 1. Clone the repository and navigate to project
cd "d:\Sanskar\programming\projects\Solution Challenge 2026"

# 2. Run installation script
bash scripts/install-deps.sh

# 3. Copy backend environment template
cp backend/.env.example backend/.env.local

# 4. Update backend/.env.local with your configuration
# - Configure MongoDB connection (local docker or Atlas)
# - Optionally set PYTHON_EXECUTABLE if needed on your machine

# 5. (Optional) Frontend API target
# Create frontend/.env.local with:
# NEXT_PUBLIC_API_URL=http://localhost:3001

# 6. Start local services
docker compose up -d

# 7. Start backend (in terminal 1)
cd backend
pnpm run dev

# 8. Start frontend (in terminal 2)
cd frontend
pnpm run dev

# 9. Access dashboard
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
```

## 💻 Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Node.js (Express) | Fast, async-ready, JS ecosystem |
| **Database** | MongoDB | Flexible schema, JSON-native, scales easily |
| **Frontend** | Next.js + Tailwind | React SSR, built-in optimizations, beautiful UX |
| **Python Tasks** | ImageHash, OpenCV | Specialized fingerprinting and image processing |
| **Package Manager** | pnpm | Fast, efficient, workspace-friendly |
| **Cloud** | Google Cloud | Provided credits for deployment |

## 📁 Project Structure

```
.
├── backend/                     # Node.js Express API
│   ├── src/
│   │   ├── api/                 # Route handlers
│   │   ├── services/            # Business logic
│   │   ├── models/              # MongoDB models (Mongoose)
│   │   └── middleware/          # Express middleware
│   ├── python/                  # Python workers (fingerprinting, crawling)
│   ├── fixtures/                # Manual testing image fixtures
│   ├── docs/                    # API contracts and test reports
│   ├── postman/                 # Postman collections for manual API testing
│   ├── package.json
│   └── .env.example
├── frontend/                    # Next.js dashboard
│   ├── app/                     # App Router routes
│   ├── components/              # Reusable React components
│   ├── lib/                     # Utilities and API client
│   └── package.json
├── .github/
│   ├── AGENTS.md                # Workspace agent routing and guardrails
│   ├── agents/                  # Executable custom agents (*.agent.md)
│   ├── instructions/            # File/task instructions (*.instructions.md)
│   ├── skills/                  # Copilot skills (.github/skills/<name>/SKILL.md)
│   ├── prompts/                 # Prompt library (*.prompt.md)
│   └── hooks/                   # Copilot hook configs (*.json)
├── scripts/
│   ├── install-deps.sh          # One-time setup
│   └── update-docs.sh           # Documentation updates
├── docker-compose.yml           # Local services (MongoDB, Redis)
├── PLAN.md                      # Project strategy and architecture
├── ROADMAP.md                   # 10-day execution plan (updated daily)
└── README.md                    # This file
```

## 🚀 Development Workflow

### Installing Dependencies (CRITICAL RULES)

**Always use pnpm CLI. NEVER edit package.json directly.**

```bash
# Add production dependency
pnpm add express

# Add dev dependency
pnpm add -D @types/node

# Remove dependency
pnpm remove package-name

# List all dependencies
pnpm list --depth=0

# Update all packages
pnpm update
```

### Backend Development

```bash
cd backend

# Start with hot-reload
pnpm run dev

# Run tests
pnpm run test

# Build for production
pnpm run build
```

**Key Endpoints:**
- `POST /api/v1/assets` - Upload sports media
- `GET /api/v1/assets` - List registered assets
- `POST /api/v1/assets/fingerprints/batch` - Recompute fingerprints for multiple assets
- `POST /api/v1/detections/search/{assetId}` - Trigger queued detection search
- `GET /api/v1/detections/jobs/{jobId}` - Get detection job status
- `GET /api/v1/detections` - Get paginated detection results
- `GET /api/v1/detections/{id}` - Get detection detail

### Frontend Development

```bash
cd frontend

# Start dev server (http://localhost:3000)
pnpm run dev

# Build for production
pnpm build

# Start production server
pnpm run start

# Run linting
pnpm run lint
```

**Key Pages:**
- `/` - Dashboard (asset overview)
- `/upload` - Upload new sports media
- `/detections` - Trigger detection runs and filter confidence-scored results

### Python Fingerprinting

```bash
cd backend/python

# Activate virtual environment
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

# Generate fingerprint for image
python fingerprint_service.py path/to/image.jpg

# Generate fingerprints for multiple images
python batch_fingerprint_service.py path/to/image1.jpg path/to/image2.jpg

# Compare one reference image against multiple candidate images
python detection_service.py --reference path/to/reference.jpg path/to/candidate1.jpg path/to/candidate2.jpg

# Run crawler service (twitter target)
python crawler_service.py --platform twitter --keywords sports athletic football basketball olympics --limit 120 --output-dir ../data/crawled/twitter

# Compatibility wrapper entrypoint
python crawler_worker.py --platform twitter --limit 120 --output-dir ../data/crawled/twitter
```

## 📋 Documentation

- **[PLAN.md](./PLAN.md)** - Project strategy, architecture, tech stack rationale
- **[ROADMAP.md](./ROADMAP.md)** - 10-day sprint plan with daily tasks and milestones
- **[TEAM_OPERATING_MODEL.md](./TEAM_OPERATING_MODEL.md)** - Issue/branch/sync protocol for 4-person collaboration
- **[backend/docs/asset-api-contract.md](./backend/docs/asset-api-contract.md)** - Asset endpoint request and response contract
- **[backend/docs/reports/day2-asset-endpoint-manual-test.md](./backend/docs/reports/day2-asset-endpoint-manual-test.md)** - Manual Day 2 asset endpoint smoke report
- **[backend/docs/detection-api-contract.md](./backend/docs/detection-api-contract.md)** - Detection endpoint request and response contract
- **[backend/docs/reports/day3-detection-endpoint-manual-test.md](./backend/docs/reports/day3-detection-endpoint-manual-test.md)** - Manual Day 3 detection endpoint smoke report
- **[backend/docs/crawler-service.md](./backend/docs/crawler-service.md)** - Crawler architecture, runtime controls, and output schema
- **[backend/docs/reports/day3-crawler-manual-test.md](./backend/docs/reports/day3-crawler-manual-test.md)** - Manual Day 3 crawler execution and integration report
- **[backend/postman/day2-asset-api.postman_collection.json](./backend/postman/day2-asset-api.postman_collection.json)** - Postman collection for Day 2 asset APIs
- **[.github/AGENTS.md](./.github/AGENTS.md)** - Workspace-level agent routing and guardrails
- **[.github/agents/](./.github/agents/)** - Executable domain agents (`*.agent.md`)
- **[.github/skills/README.md](./.github/skills/README.md)** - Skills catalog and modular skill folders
- **[.github/prompts/README.md](./.github/prompts/README.md)** - Prompt library for repeatable tasks
- **[.github/instructions/](./.github/instructions/)** - On-demand instructions for project standards
- **[.github/hooks/](./.github/hooks/)** - Copilot hook configs and enforcement scripts

### Updating Documentation

Keep documents synchronized:
```bash
# Update timestamps and validate
bash scripts/update-docs.sh

# This will:
# - Update Last Updated timestamps
# - Validate markdown headers
# - Check GitHub folder structure
# - Verify tech stack consistency
```

## 🔄 Git Workflow

```bash
# 1) Start from a GitHub issue (#12 example)
git fetch origin
git checkout -b feat/12-asset-upload origin/main

# 2) Make focused changes and commit
git add .
git commit -m "feat: add asset upload endpoint"

# 3) Periodic sync check (run every 60-90 min)
bash scripts/git-sync-check.sh

# 4) Push branch
git push -u origin feat/12-asset-upload

# 5) Create PR linked to issue and request review
```

Use one branch per issue and one PR per branch. Full collaboration protocol is in [TEAM_OPERATING_MODEL.md](./TEAM_OPERATING_MODEL.md).

**Pre-commit Hook:** Automatically validates documentation before commits
```bash
chmod +x .git/hooks/pre-commit
```

## 🧪 Testing

```bash
# Backend tests
cd backend
pnpm run test

# Frontend tests
cd frontend
pnpm run test

# Python tests
cd backend/python
source .venv/bin/activate
python -m unittest -v test_fingerprint_accuracy.py

# Generate 6 sample fixture images for manual API testing
python generate_asset_fixtures.py

# Run manual Day 2 asset endpoint smoke script (PowerShell)
cd ../scripts
./manual_asset_api_smoke.ps1 -FixtureFile "../fixtures/images/fixture-01.png"
```

## 🐳 Docker & Deployment

### Local Development with Docker

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend

# Stop services
docker compose down
```

### Deploy to Google Cloud

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Deploy backend to Cloud Run
gcloud run deploy sports-media-backend \
  --source backend/ \
  --platform managed \
  --region us-central1 \
  --memory 512Mi

# Deploy frontend to Cloud Run
# See deployment guide in ROADMAP.md Day 7
```

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard (Next.js Frontend)               │
│       - SSR for performance                                 │
│       - Upload sports media                                 │
│       - View detections in real-time                        │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────────┐
│            Backend API (Node.js + Express)                  │
│   ┌──────────────┬──────────────┬──────────────┐           │
│   │ Asset        │ Fingerprint  │ Detection    │           │
│   │ Management   │ Bridge       │ Engine       │           │
│   └──────────────┴──────────────┴──────────────┘           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼─────┐ ┌───▼────┐ ┌────▼──────┐
   │ MongoDB   │ │ Redis  │ │ Google    │
   │ (Assets,  │ │(Cache) │ │ Custom    │
   │ Fingers)  │ │        │ │ Search    │
   └───────────┘ └────────┘ │ API (SSL) │
                            └───────────┘

┌─────────────────────────────────────────────────────────────┐
│    Detection & Crawler Workers (Python + Node.js)           │
│   ┌──────────────┬──────────────┬──────────────┐           │
│   │ Web Crawler  │ Search API   │ Fingerprint  │           │
│   │ (Scheduler)  │ (Google)     │ Matcher      │           │
│   │ (Python)     │ (Node.js)    │ (Python)     │           │
│   └──────────────┴──────────────┴──────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Team Roles & Responsibilities

- **Person 1:** Backend Infrastructure + Database (Node.js + MongoDB)
- **Person 2:** Fingerprinting & Image Processing (Python + ImageHash)
- **Person 3:** Web Crawling & Platform Integration (Python + BeautifulSoup)
- **Person 4:** Frontend Dashboard & UX (Next.js + Tailwind)

See [.github/AGENTS.md](./.github/AGENTS.md) and [.github/agents/](./.github/agents/) for detailed responsibilities and agent definitions.

## 📈 Success Metrics (MVP)

- ✅ Upload sports media and generate fingerprint
- ✅ Detect unauthorized copies on 5+ platforms
- ✅ Display results with confidence scores and risk assessment
- ✅ Dashboard fully functional and intuitive
- ✅ System deployed and accessible to judges
- ✅ Demo runs smoothly under time pressure

## 🐛 Troubleshooting

### "Module not found" error
```bash
# Ensure all dependencies installed
pnpm install

# Check if pnpm-lock.yaml is committed
git add pnpm-lock.yaml
```

### MongoDB connection fails
```bash
# Verify MongoDB is running
docker-compose ps

# Check connection string in .env.local
# Format: mongodb://localhost:27017/sports-media-protection
```

### Tailwind CSS not working in Next.js
```bash
# Verify Next.js was created with Tailwind
# If not, reinstall:
# pnpm create next-app@latest frontend --typescript --tailwind --app
```

### Python script timeout
```bash
# Increase timeout in Node.js spawn call
# { timeout: 60000 } in child_process options

# Or run Python script separately to profile
python backend/python/fingerprint_service.py test.jpg
```

More troubleshooting in [.github/skills/README.md](./.github/skills/README.md).

## 🔗 Important Links

- **Project ROADMAP:** [ROADMAP.md](./ROADMAP.md) - Daily tasks and milestones
- **Project PLAN:** [PLAN.md](./PLAN.md) - Architecture and strategy
- **Team Agents:** [.github/AGENTS.md](./.github/AGENTS.md)
- **Skills & Practices:** [.github/skills/README.md](./.github/skills/README.md)
- **Prompt Library:** [.github/prompts/README.md](./.github/prompts/README.md)
- **Copilot Hooks:** [.github/hooks/README.md](./.github/hooks/README.md)

## 📚 Learning Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Express.js Guide](https://expressjs.com/)
- [MongoDB Manual](https://docs.mongodb.com/manual/)
- [Python ImageHash](https://github.com/JohannesBuchner/imagehash)
- [pnpm Documentation](https://pnpm.io/)

## ❓ FAQ

**Q: Can I install packages and edit package.json?**  
A: **No.** Always use `pnpm add <package>` CLI. Never edit package.json directly. This ensures consistency across the team.

**Q: Do I need to install Tailwind separately in Next.js?**  
A: **No.** Create Next.js with `pnpm create next-app@latest frontend --typescript --tailwind --app`. Tailwind is already included.

**Q: How do I call Python from Node.js?**  
A: Use `child_process.spawn()` to call Python scripts. Pass input via CLI args or stdin, read JSON from stdout.

**Q: What if I hit API rate limits?**  
A: Implement caching with Redis, use exponential backoff, and combine requests where possible.

**Q: How do I deploy to Google Cloud?**  
A: Use Cloud Run for serverless hosting (auto-scales). See ROADMAP.md Day 7 for detailed instructions.

## 📞 Support

- **Daily Standup:** 15 min sync with the team (time TBD)
- **Blockers:** Report immediately in team chat
- **Documentation:** Check PLAN.md, ROADMAP.md, and .github/ files
- **AI Help:** Use custom agents: @BackendDev, @FrontendDev, @PythonWorker, @InfraOps

## 📄 License

This project is created for the Solution Challenge 2026 hackathon. Use and modify as needed for the competition.

---

**Last Updated:** April 14, 2026  
**Status:** Active Development (Day 1 ready)  
**Team:** 4 Developers  
**Duration:** 10 Days
