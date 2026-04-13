# Digital Asset Protection - 10-Day Roadmap

**Project:** Digital Sports Media Protection Hackathon MVP  
**Timeline:** 10 Days (Daily breakdown with milestones)  
**Team:** 4 Developers  

---

## Day-by-Day Breakdown

### **DAY 1: Foundation & Setup** 🚀
**Theme:** Architecture Design, Environment Prep, Team Alignment

#### Morning (Team Sync - 1 hour)
- [ ] Finalize tech stack decisions as a team
- [ ] Assign roles and responsibilities
- [ ] Define git workflow and repository structure
- [ ] Agree on API contracts and data models
- [ ] Create Day 1 GitHub issues and assign owners/reviewers
- [ ] Enforce one-issue-one-branch naming convention
- [ ] Agree on 60-90 minute remote sync cadence (`bash scripts/git-sync-check.sh`)

#### Development Tasks

**Person 1: Backend Infrastructure**
- [x] Initialize Node.js project: `pnpm init`
- [x] Install core dependencies: `pnpm add express dotenv cors mongoose redis`
- [x] Install dev dependencies: `pnpm add -D nodemon`
- [x] Create MongoDB schema via Mongoose:
  - `Asset` model (id, name, creator, event_date, upload_date, fingerprint_hash)
  - `Detection` model (id, asset_id, platform, url, confidence, date_found, status)
  - `Fingerprint` model (id, asset_id, hash_value, algorithm, created_at)
- [ ] Set up connection to MongoDB Atlas (free tier)
- [x] Create `.env.example` with required variables
- [x] Scaffold Express server structure with basic middleware

**Person 2: Fingerprinting POC**
- [ ] Set up Python virtual environment: `python -m venv venv`
- [ ] Install packages: `pip install pillow imagehash opencv-python requests`
- [x] Create `backend/python/fingerprint_service.py` 
- [x] Write basic image fingerprinting (generate hash for 1 image)
- [ ] Test consistency (same image = same hash)
- [ ] Create Python bridge for Node.js to call (via child_process)

**Person 3: Project Setup**
- [x] Create GitHub repo structure
- [ ] Initialize docker-compose.yml for MongoDB + Redis
- [ ] Create Dockerfile for Node.js backend
- [x] Create Next.js project: `pnpm create next-app@latest frontend --typescript --tailwind --app`
- [x] **Important:** Verify Tailwind CSS is already working (NOT installed separately)

**Person 4: Frontend Scaffold**
- [x] Next.js project created with automatic routing
- [x] Set up `app/layout.js` (main layout with Tailwind)
- [x] Create initial pages: `app/page.js`, `app/upload/page.js`, `app/detections/page.js`
- [ ] Set up API client (fetch or axios via pnpm)
- [ ] Create basic navigation component with Tailwind styling
- [ ] Verify hot reload and Tailwind CSS theming

#### End of Day Deliverables
- ✅ GitHub repo structure complete
- ✅ All environments running locally
- ✅ Database schema finalized
- ✅ Basic fingerprinting algorithm running
- ✅ Frontend skeleton deployed locally

**Acceptance Criteria:** All team members can `docker-compose up` and access local environment

---

### **DAY 2: Asset Management API** 📡
**Theme:** Core Backend Services, Asset Upload, Fingerprint Generation

#### Development Tasks

**Person 1: Backend API - Asset Endpoints**
- [x] Create `/api/assets` endpoints:
  - `POST /assets` - Upload new media + metadata
  - `GET /assets` - List all registered assets
  - `GET /assets/{id}` - Get asset details
  - `DELETE /assets/{id}` - Remove asset
- [ ] Implement file upload handling (store files in `uploads/` folder or cloud)
- [x] Add input validation (file size, format)
- [x] Error handling and response standardization

**Person 2: Fingerprinting Integration**
- [ ] Integrate fingerprint_service into asset upload pipeline
- [ ] When asset uploaded → automatically generate fingerprint
- [ ] Store fingerprint in DB
- [ ] Implement batch fingerprinting for multiple files
- [ ] Create unit tests for fingerprinting accuracy

**Person 3: API Documentation & Testing**
- [ ] Set up Postman/Insomnia collections for all endpoints
- [ ] Document expected request/response formats
- [ ] Test all asset endpoints manually
- [ ] Create test data fixtures (5-10 sample images)

**Person 4: Frontend - Asset Upload UI**
- [ ] Create upload form component
- [ ] File input with preview
- [ ] Metadata form (event name, date, creator)
- [ ] Submit to backend API
- [ ] Show success/error messages
- [ ] Display uploaded assets list

#### End of Day Deliverables
- ✅ Asset CRUD API fully functional
- ✅ File upload working end-to-end
- ✅ Fingerprints generated and stored
- ✅ UI for asset upload and listing
- ✅ Test data loaded in system

**Acceptance Criteria:** Can upload image → fingerprint generated → appears in asset list

---

### **DAY 3: Detection Foundation & Crawler Setup** 🕷️
**Theme:** Web Crawler Basics, Detection Pipeline Foundation

#### Development Tasks

**Person 1: Backend - Detection API**
- [ ] Create `/api/detections` endpoints:
  - `POST /detections/search/{asset_id}` - Trigger detection for an asset
  - `GET /detections?asset_id={id}` - Get detections for asset
  - `GET /detections/{id}` - Get detection details
- [ ] Implement detection job queueing (use background tasks in FastAPI)
- [ ] Store detection results with confidence score
- [ ] Add pagination for large result sets

**Person 2: Detection Service**
- [ ] Create detection_service.py:
  - Compare asset fingerprint against crawled content
  - Calculate similarity score (0-100)
  - Flag as "match" if score > threshold (e.g., 85%)
- [ ] Implement batch matching algorithm
- [ ] Handle edge cases (corrupted images, very small files)

**Person 3: Basic Web Crawler**
- [ ] Set up crawler_service.py skeleton
- [ ] Target Platform 1: Twitter/X
  - Use Twitter API (or scraping if no API access)
  - Search for keywords related to sports (e.g., "sports", "athletic", event names)
  - Extract image URLs from results
  - Store locally for fingerprint comparison
- [ ] Implement retry logic and rate limiting
- [ ] Crawl sample data (100-500 images for testing)

**Person 4: Frontend - Detections Dashboard**
- [ ] Create detections view component
- [ ] Display list of detections per asset
- [ ] Show detected image, source URL, confidence score
- [ ] Add filters: platform, confidence range, date
- [ ] Button to trigger new detection run on asset

#### End of Day Deliverables
- ✅ Detection API endpoints created and tested
- ✅ Fingerprint matching working (5-10 test results)
- ✅ Basic crawler for 1 platform working
- ✅ Detection results displayed on dashboard
- ✅ 100+ crawled images in test database

**Acceptance Criteria:** Upload asset → run detection → see 2-5 matches with confidence scores

---

### **DAY 4: Multi-Platform Crawler & Detection Scaling** 🌐
**Theme:** Scale Crawler, Integrate Multiple Platforms

#### Development Tasks

**Person 1: Backend Optimization**
- [ ] Add result caching (Redis) to avoid re-checking same content
- [ ] Implement detection result deduplication (same image from multiple URLs)
- [ ] Add detection history tracking
- [ ] Performance optimization: batch processing for multiple assets

**Person 2: Fingerprinting Polish**
- [ ] Test fingerprinting on 50+ diverse images
- [ ] Tune similarity threshold based on test results
- [ ] Add support for minor image modifications (compression, cropping)
- [ ] Document hash algorithm choice and why it works

**Person 3: Extend Crawler - 4 More Platforms**
- [ ] Platform 2: Instagram (hashtag search for sports)
- [ ] Platform 3: Reddit (sports subreddits)
- [ ] Platform 4: Facebook public posts
- [ ] Platform 5: YouTube (video frame extraction + hashing)
- [ ] Implement platform-agnostic crawler interface
- [ ] Add rotating user agents and rate limiting
- [ ] Crawler can now handle ~1000 images in crawl cycle

**Person 4: Dashboard Enhancements**
- [ ] Add platform filter to detection results
- [ ] Show detection timeline (when each copy found)
- [ ] Add "Report" button for false positives
- [ ] Implement real-time detection status (running/completed)
- [ ] Add simple statistics (total assets, total detections, platforms monitored)

#### End of Day Deliverables
- ✅ 5 platforms integrated into crawler
- ✅ 500+ images crawled across platforms
- ✅ Detection accuracy validated (tune thresholds)
- ✅ Caching layer reduces repeated checks by 70%+
- ✅ Dashboard shows multi-platform results

**Acceptance Criteria:** Can detect same sports image on 3+ different platforms

---

### **DAY 5: Anomaly Detection & Risk Scoring** 📊
**Theme:** Intelligence Layer, Risk Analytics

#### Development Tasks (Morning: Internal Demo First!)

**Morning Sync (2 hours):**
- [ ] Demo all functionality built so far
- [ ] Identify any blockers or gaps
- [ ] Adjust priorities if needed

**Person 1: Risk Scoring Algorithm**
- [ ] Implement detection risk score (0-100):
  - Base score from confidence (0-40 points)
  - Platform multiplier: viral platforms (TikTok, Instagram) = higher (0-20 points)
  - Velocity score: multiple detections in short time (0-20 points)
  - Reach estimate: follower count / engagement (0-20 points)
- [ ] Store risk score with each detection
- [ ] Expose via API: `/detections/{id}/risk`

**Person 2: Anomaly Detection**
- [ ] Implement trend analysis:
  - Detect sudden spike in detections for asset
  - Compare against baseline
  - Flag "trending unauthorized use"
- [ ] Implement clustering:
  - Group similar detections (same coordinated misuse)
  - Detect coordinated sharing patterns
- [ ] Add to API: `GET /assets/{id}/anomalies`

**Person 3: Search API Integration (Optional Scaling)**
- [ ] Integrate Google Reverse Image Search API OR TinEye API
- [ ] For each asset fingerprint, query API to find all public instances
- [ ] Supplement crawler results (reach beyond platform-specific APIs)
- [ ] Handle API rate limits and costs gracefully

**Person 4: Enhanced Dashboard**
- [ ] Display risk score on each detection (color-coded: green/yellow/red)
- [ ] Add anomaly alerts section (trending, coordinated misuse detected)
- [ ] Create analytics page:
  - Total assets monitored
  - Detection heatmap (geographic, by platform)
  - Risk distribution chart
- [ ] Export detection results as CSV/JSON

#### End of Day Deliverables
- ✅ Risk scoring fully functional
- ✅ Anomaly detection working on 5+ test cases
- ✅ Optional: Search API integrated
- ✅ Dashboard shows risk+anomaly insights
- ✅ Analytics page implemented
- ✅ Internal demo completed successfully

**Acceptance Criteria:** System can flag "trending violation" and assign risk scores

---

### **DAY 6: Integration & Testing** 🧪
**Theme:** End-to-End Testing, Bug Fixes, Performance Tuning

#### Development Tasks

**Person 1: API Testing & Stability**
- [ ] Run full test suite (unit + integration tests)
- [ ] Test API under load (simulate 100+ concurrent detection jobs)
- [ ] Fix any database performance issues (add indexes)
- [ ] Test error cases and edge cases
- [ ] Document all API endpoints (OpenAPI/Swagger)

**Person 2: Fingerprint Accuracy**
- [ ] Test on 100+ diverse images
- [ ] Benchmark false positive rate (< 5% target)
- [ ] Benchmark false negative rate (< 5% target)
- [ ] Test edge cases: very small images, heavily compressed, different formats
- [ ] Create test report with performance metrics

**Person 3: Crawler Reliability**
- [ ] Test crawlers on all 5 platforms for 24-hour stability
- [ ] Verify no data loss or duplicates
- [ ] Test error recovery (network interrupts, API downtime)
- [ ] Optimize crawler performance (speed, memory usage)
- [ ] Document platform-specific quirks and limitations

**Person 4: Frontend QA & UX**
- [ ] Test all UI flows end-to-end
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness check
- [ ] Performance profiling (no slow page loads)
- [ ] User feedback: Is UI intuitive? What's confusing?

#### End of Day Deliverables
- ✅ 95%+ API test coverage
- ✅ No critical bugs remaining
- ✅ Dashboard performs smoothly under load
- ✅ Full API documentation (Swagger)
- ✅ All 5 crawlers verified stable
- ✅ UX refinements completed

**Acceptance Criteria:** System is production-ready; judges can run without crashes

---

### **DAY 7: Docker Deployment & Demo Polish** 🐳
**Theme:** Containerization, Deployment, Demo Readiness

#### Development Tasks

**Person 1: Docker & Deployment**
- [ ] Finalize docker-compose.yml (backend, frontend, PostgreSQL, Redis)
- [ ] Test full stack deployment locally
- [ ] Create `.env.example` file with all required variables
- [ ] Add setup documentation (how to run locally)
- [ ] Deploy to Heroku / AWS / Azure (pick one for live demo)
- [ ] Create deployment checklist for demo day

**Person 2: Data Prep for Demo**
- [ ] Create 10 high-quality sample sports images (diverse: photos, graphics, videos frames)
- [ ] Pre-upload and fingerprint all samples
- [ ] Pre-crawl and generate detection results (run crawler manually or seed database)
- [ ] Document exact demo data for consistency
- [ ] Create backup of database state before demo day

**Person 3: Crawler Optimization**
- [ ] Optimize crawler speed (most important platform first)
- [ ] Add cron job scheduling (run detections every 12 hours automatically)
- [ ] Implement logging and monitoring
- [ ] Create crawler status page in dashboard

**Person 4: Demo UI Refinement**
- [ ] Create impressive landing page with feature highlights
- [ ] Add smooth animations and polish
- [ ] Create demo walkthrough page (step-by-step instructions)
- [ ] Add "Demo" button that pre-loads sample data
- [ ] Create feature showcase video (optional, 30sec)
- [ ] Prepare key metrics/stats to highlight

#### End of Day Deliverables
- ✅ Full Docker stack working end-to-end
- ✅ Live deployment accessible (e.g., heroku app running)
- ✅ Demo database seeded with results
- ✅ Dashboard looks polished and professional
- ✅ All documentation complete
- ✅ Deployment runbook created

**Acceptance Criteria:** Anyone can download repo and run `docker-compose up` to see full system

---

### **DAY 8: Final Integration & Performance Optimization** ⚡
**Theme:** End-to-End Features, Optimization, Stretch Goals

#### Development Tasks

**Person 1: API Optimization**
- [ ] Profile API for slow endpoints
- [ ] Implement caching strategically
- [ ] Batch processing optimization
- [ ] Add API monitoring and logging
- [ ] Prepare API for live demo (ensure reliability)

**Person 2: Advanced Detection Features (Stretch)**
- [ ] Add support for video fingerprinting (extract key frames)
- [ ] Implement ML-based false positive filtering (if time permits)
- [ ] Add hash collision detection
- [ ] Support for batch asset uploads

**Person 3: Crawler Enhancement (Stretch)**
- [ ] Add 6th platform integration (if crawler is stable)
- [ ] Implement image scraping from blogs/news sites using Google API
- [ ] Real-time crawler job monitoring
- [ ] Performance metrics: detection speed, accuracy, platform coverage

**Person 4: Dashboard Completion (Stretch)**
- [ ] Add export functionality (PDF report of violations)
- [ ] Implement user authentication (simple login for demo)
- [ ] Add alert notifications (email/webhook on new violation detected)
- [ ] Create admin panel for system health monitoring
- [ ] Prepare 3-5 minute demo script with talking points

#### End of Day Deliverables
- ✅ All core features 100% complete
- ✅ Performance optimized: <2s detection queries
- ✅ Stretch goals accomplished (if time allows)
- ✅ Demo script written and rehearsed by Person 4
- ✅ All team members understand full system
- ✅ System stable and crash-free

**Acceptance Criteria:** System can handle judge's demo + unexpected usage patterns

---

### **DAY 9: Presentation Prep & Polish** 🎤
**Theme:** Documentation, Presentation, Final Polish

#### Development Tasks / Deliverables

**Person 1: Technical Documentation**
- [ ] Write comprehensive README.md:
  - Project overview
  - Architecture diagram
  - Tech stack with justification
  - How to run locally (docker-compose)
  - API documentation link
  - Performance benchmarks
- [ ] Create architecture diagram (ASCII or Mermaid)
- [ ] Document design decisions and trade-offs

**Person 2: Demo Data & Scenarios**
- [ ] Finalize demo script with exact clickthrough sequence
- [ ] Record demo flows (what to show, what to say)
- [ ] Prepare 3 demo scenarios:
  1. Upload asset → See dashboard
  2. Trigger detection → Show real-time results
  3. Analyze risk & anomalies
- [ ] Backup demo database (no surprises on demo day)

**Person 3: Crawler Documentation & Monitoring**
- [ ] Document each platform's crawler implementation
- [ ] Create maintenance runbook (how to add new platform)
- [ ] Performance report: detection speed, accuracy metrics
- [ ] Prepare talking points: why this approach, strengths, limitations

**Person 4: Presentation Slide Deck**
- [ ] 15-20 slide presentation:
  - Problem statement (1-2 slides)
  - Solution overview (2-3 slides)
  - Architecture & tech choices (2-3 slides)
  - Key features & demo (3-4 slides)
  - Results & metrics (2-3 slides)
  - Future roadmap (1-2 slides)
  - Team & conclusion (1 slide)
- [ ] Rehearse presentation (time it: 5-7 min)
- [ ] Prepare Q&A talking points

**Team Activity:**
- [ ] Full dry-run presentation (all 4 present together)
- [ ] Feedback session: what works, what to refine
- [ ] Practice Q&A scenarios
- [ ] Decide speaker order and who covers which sections

#### End of Day Deliverables
- ✅ README.md and full documentation complete
- ✅ Presentation slides ready (polished, on-brand)
- ✅ Demo script proven and rehearsed
- ✅ All team members can present any section
- ✅ Backup ready: system state, demo data, presentation backup
- ✅ Confidence level: HIGH

**Acceptance Criteria:** Presentation is <7 min, covers all key points, team feels ready

---

### **DAY 10: Demo Day Execution & Contingency** 🏆
**Theme:** Final Checks, Live Presentation, Q&A

#### Morning (3-4 hours before demo)

**Pre-Demo Checklist (Person 1 Lead):**
- [ ] Verify live deployment is running and stable
- [ ] Test all demo flows one more time
- [ ] Check internet connection / backup hotspot ready
- [ ] Prepare laptop with full backup downloaded
- [ ] Have local docker-compose version ready (in case live demo fails)
- [ ] Screenshots/screen recording as fallback for critical demos

**Demo Day Timeline:**

**30 min Before:**
- [ ] Set up demo environment (laptop, projector, internet)
- [ ] Load presentation slides
- [ ] Open demo system and verify it's responsive
- [ ] Quick team sync: remind each person of their sections

**Demo Execution (5-7 minutes):**
1. **Intro (30 sec)** - Person 4: Problem statement, why it matters
2. **Solution Overview (1 min)** - Person 1: What we built
3. **Live Demo (3-4 min)**:
   - Person 2: Upload sports image, show fingerprint generation
   - Person 3: Trigger detection, show crawler finding matches across platforms
   - Person 4: Show risk scoring and anomaly detection
4. **Results & Impact (1 min)** - Person 1: Key metrics, scalability
5. **Q&A (2-3 min)** - All team prepared to answer

**Talking Points per Person:**
- **Person 1:** Architecture, scalability, why FastAPI + PostgreSQL
- **Person 2:** Fingerprinting algorithm, how it survives edits, accuracy
- **Person 3:** Multi-platform crawler, how we ensure coverage, platform challenges
- **Person 4:** User experience, why dashboard matters, ease of deployment

#### Contingency Plans

**If Live Demo Fails:**
- [ ] Fallback 1: Pre-recorded screen capture showing full flow
- [ ] Fallback 2: Show detailed screenshots with explanation
- [ ] Fallback 3: Run local docker-compose on judge's system if internet dies

**If One Feature Breaks:**
- [ ] Have explanation ready: "Here's what would happen..." + screenshot
- [ ] Focus on other 2-3 features that work perfectly
- [ ] Judges understand MVP nature - one missing piece isn't fatal

#### Demo Day Deliverables
- ✅ 5-7 min presentation executed flawlessly
- ✅ Live demo runs smoothly
- ✅ Team answers judges' questions confidently
- ✅ GitHub repo is clean, well-documented, runnable
- ✅ All links work (deployment, documentation)

**Success Criteria:** Judges understand the problem, see the value of the solution, and believe team executed well under time pressure

---

## Milestone Summary

| Day | Milestone | Status |
|-----|-----------|--------|
| 1 | Environment & Foundation | Not Started |
| 2 | Asset Management API | Not Started |
| 3 | Detection Foundation | Not Started |
| 4 | Multi-Platform Crawler | Not Started |
| 5 | Anomaly & Risk Scoring | Not Started |
| 6 | Integration & Testing | Not Started |
| 7 | Docker & Deployment | Not Started |
| 8 | Optimization & Stretch | Not Started |
| 9 | Documentation & Presentation | Not Started |
| 10 | Demo Day Execution | Not Started |

---

## Critical Success Factors

1. **Daily Sync:** 15 min standup every morning (same time)
2. **Staged Integration:** Merge to main daily, test together
3. **Demo Mindset:** Build for judges, not perfection
4. **Documentation:** Async updates help team stay aligned
5. **Fallback Plans:** Prepare contingencies for each component

---

## Quick Reference: Tool Stack

- **Backend:** Node.js (Express) + MongoDB + Redis
- **Frontend:** Next.js + Tailwind CSS (installed together)
- **Python Workers:** ImageHash, OpenCV, BeautifulSoup for specialized tasks
- **Package Manager:** pnpm (CLI only, never edit package.json)
- **Crawling:** Python (BeautifulSoup/Selenium for targeted platforms)
- **APIs:** Google Cloud Search API (use provided credits)
- **Deployment:** Docker + Google Cloud (Compute Engine or Cloud Run)
- **Collaboration:** GitHub, Discord/Slack for daily sync

---

**Last Updated:** April 14, 2026  
**Status:** Ready for execution
