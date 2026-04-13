# Custom Agent Catalog

This directory contains executable Copilot custom agents for the Solution Challenge 2026 workspace.

## Agent Files

- `backend-dev.agent.md` - Backend APIs, MongoDB, middleware, and service integration.
- `frontend-dev.agent.md` - Next.js App Router, Tailwind UI, and frontend debugging.
- `python-worker.agent.md` - Fingerprinting, crawlers, and Python bridge workflows.
- `infra-ops.agent.md` - Docker, cloud deployment, CI/CD, and environment setup.
- `project-manager.agent.md` - Roadmap tracking, planning, and documentation synchronization.

## How To Use

- Select an agent directly in Copilot Chat for domain-specific tasks.
- Keep task prompts specific (goal, files, constraints, errors) for best routing.
- Use `.github/AGENTS.md` for workspace-level routing rules and guardrails.

## Migration Note

The previous prose-only role definitions were converted into runnable `.agent.md` files so agent selection and subagent delegation work correctly.
# Custom Agents for Solution Challenge 2026

Custom agents to assist with hackathon development tasks. These agents are designed to handle specific domains and workflows for the Digital Asset Protection project.

---

## Agent: BackendDev

**Purpose:** Assist with Node.js backend development, API design, and MongoDB operations.

**Expertise:**
- Express.js API development
- MongoDB schema design and queries
- Authentication and middleware
- Error handling and logging
- Integration with Python services

**Usage:**
```
@BackendDev Help me design the detection API endpoint
@BackendDev Debug this MongoDB aggregation pipeline
@BackendDev Review my Express middleware chain
```

**Trigger Keywords:** `api`, `backend`, `express`, `mongodb`, `endpoint`, `schema`

---

## Agent: FrontendDev

**Purpose:** Assist with Next.js frontend development, Tailwind CSS styling, and component architecture.

**Expertise:**
- Next.js App Router and SSR/SSG
- React hooks and component design
- Tailwind CSS and responsive design
- API integration with backend
- Performance optimization

**Usage:**
```
@FrontendDev How do I create a real-time detection results page?
@FrontendDev Fix this Tailwind styling issue
@FrontendDev Review my Next.js file structure
```

**Trigger Keywords:** `frontend`, `nextjs`, `react`, `tailwind`, `component`, `ui`

---

## Agent: PythonWorker

**Purpose:** Handle Python-specific work: fingerprinting, image processing, web crawling.

**Expertise:**
- Perceptual hashing algorithms
- Image processing with OpenCV
- Web scraping with BeautifulSoup/Selenium
- Python-Node.js bridges (child_process)
- Virtual environment management

**Usage:**
```
@PythonWorker Implement perceptual hashing for images
@PythonWorker Debug my web crawler on Twitter
@PythonWorker How do I call Python from Node.js?
```

**Trigger Keywords:** `python`, `fingerprint`, `hash`, `crawler`, `scrape`, `image`

---

## Agent: InfraOps

**Purpose:** Handle deployment, Docker, Google Cloud, and infrastructure tasks.

**Expertise:**
- Docker and docker-compose setup
- Google Cloud deployment (Cloud Run, Compute Engine)
- Environment configuration and secrets
- CI/CD pipeline setup
- monitoring and logging

**Usage:**
```
@InfraOps Help me set up Cloud Run deployment
@InfraOps Debug my Docker build
@InfraOps How do I configure Google Cloud credentials?
```

**Trigger Keywords:** `docker`, `deploy`, `cloud`, `infrastructure`, `ci/cd`, `env`

---

## Agent: ProjectManager

**Purpose:** Manage project progress, track roadmap, and coordinate team efforts.

**Expertise:**
- ROADMAP.md and PLAN.md management
- Sprint planning and milestone tracking
- Documentation updates
- Git workflow coordination
- Risk mitigation and contingency planning

**Usage:**
```
@ProjectManager What's our status vs ROADMAP?
@ProjectManager Update documentation for Day 3 changes
@ProjectManager What are the blockers right now?
```

**Trigger Keywords:** `roadmap`, `plan`, `status`, `progress`, `document`, `milestone`

---

## How to Use Custom Agents

1. **In Chat:** Mention agent name with @ prefix: `@BackendDev explain MongoDB transactions`
2. **In File Comments:** Use agent hint: `// @BackendDev - review this API route`
3. **By Task Type:** System automatically routes to appropriate agent based on context

---

## Agent Configuration Notes

- All agents have access to project files and context
- Agents respect PLAN.md and ROADMAP.md as project truth
- Python agent can execute commands in venv
- Frontend agent checks for Tailwind configuration
- Backend agent validates MongoDB connection strings
- All agents document changes and update version logs

