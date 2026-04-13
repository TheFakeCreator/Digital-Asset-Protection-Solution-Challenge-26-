#!/bin/bash
# scripts/install-deps.sh
# One-time setup script for the project
# Installs all dependencies using pnpm (NEVER edits package.json directly)

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_ROOT"

echo "🚀 Setting up Digital Asset Protection project..."
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed!"
    echo "Please install pnpm first:"
    echo "  npm install -g pnpm"
    exit 1
fi

echo "✓ pnpm version: $(pnpm --version)"
echo ""

# Setup Backend
if [ -d "backend" ]; then
    echo "📦 Setting up Backend..."
    cd "$PROJECT_ROOT/backend"
    
    if [ ! -f "package.json" ]; then
        echo "  Initializing backend package.json..."
        pnpm init -y
    fi
    
    echo "  Installing dependencies..."
    pnpm add express dotenv cors mongoose redis
    pnpm add -D nodemon @types/node typescript ts-node
    
    echo "✓ Backend setup complete"
    cd "$PROJECT_ROOT"
else
    echo "⚠ Backend directory not found (will be created later)"
fi

echo ""

# Setup Frontend (Next.js)
if [ -d "frontend" ]; then
    echo "📱 Setting up Frontend..."
    if [ ! -f "frontend/package.json" ]; then
        echo "  Creating Next.js app with Tailwind..."
        pnpm create next-app@latest frontend --typescript --tailwind --app --no-git
    fi
    echo "✓ Frontend setup complete (Tailwind already included)"
    cd "$PROJECT_ROOT"
else
    echo "⚠ Frontend directory not found"
    echo "  To create: pnpm create next-app@latest frontend --typescript --tailwind --app"
fi

echo ""

# Setup Python environment
if [ -d "backend/python" ]; then
    echo "🐍 Setting up Python environment..."
    cd "$PROJECT_ROOT/backend/python"
    
    if [ ! -d ".venv" ] && [ ! -d "venv" ]; then
        echo "  Creating Python virtual environment..."
        python3 -m venv venv
        source venv/bin/activate
        echo "  Installing Python packages..."
        pip install --upgrade pip
        pip install pillow imagehash opencv-python requests beautifulsoup4 selenium
        pip install pytest  # for testing
    else
        echo "  Virtual environment already exists"
    fi
    
    echo "✓ Python setup complete"
    cd "$PROJECT_ROOT"
else
    echo "⚠ backend/python directory not found"
    echo "  You'll set this up during Day 1"
fi

echo ""

# Create .env template if not exists
if [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
    echo "📋 Creating .env template..."
    cat > .env.example << 'EOF'
# Backend Configuration
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/sports-media-protection

# MongoDB
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DB=sports-media-protection

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_KEY_PATH=./credentials/service-account.json

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000

# Python Services
PYTHON_HOME=./backend/python
EOF
    echo "✓ Created .env.example (copy to .env.local for development)"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Next steps:"
echo "  1. Copy .env.example to .env.local and fill in values"
echo "  2. Start MongoDB: docker-compose up -d"
echo "  3. Start backend: cd backend && pnpm run dev"
echo "  4. Start frontend: cd frontend && pnpm run dev"
echo ""
echo "📚 Documentation:"
echo "  - Read: PLAN.md (architecture overview)"
echo "  - Read: ROADMAP.md (day-by-day tasks)"
echo "  - Check: .github/AGENTS.md (agent routing guide)"
echo "  - Explore: .github/agents/*.agent.md (custom agent definitions)"
echo "  - Check: .github/skills/README.md (skills catalog)"
echo "  - Check: .github/prompts/README.md (prompt library)"
echo "  - Check: .github/hooks/*.json (copilot hooks)"
echo ""
echo "💡 Tip: Always use 'pnpm add <package>' to install - never edit package.json directly"
