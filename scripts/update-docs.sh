#!/bin/bash
# scripts/update-docs.sh
# Updates documentation with current project status and validates markdown

set -e

TIMESTAMP=$(date '+%Y-%m-%d')
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

echo "🔧 Updating project documentation..."

# Validate PLAN.md exists
if [ ! -f "$PROJECT_ROOT/PLAN.md" ]; then
    echo "❌ PLAN.md not found!"
    exit 1
fi

# Validate ROADMAP.md exists
if [ ! -f "$PROJECT_ROOT/ROADMAP.md" ]; then
    echo "❌ ROADMAP.md not found!"
    exit 1
fi

# Check markdown has required headers
echo "✓ Checking PLAN.md headers..."
if ! grep -q "^# " "$PROJECT_ROOT/PLAN.md"; then
    echo "❌ PLAN.md missing main header (#)"
    exit 1
fi

echo "✓ Checking ROADMAP.md headers..."
if ! grep -q "^# " "$PROJECT_ROOT/ROADMAP.md"; then
    echo "❌ ROADMAP.md missing main header"
    exit 1
fi

# Update Last Updated timestamp in PLAN.md
echo "✓ Updating PLAN.md timestamp..."
sed -i -e "s/**Last Updated:.*/**Last Updated: $TIMESTAMP/" "$PROJECT_ROOT/PLAN.md"

# Update Last Updated timestamp in ROADMAP.md
echo "✓ Updating ROADMAP.md timestamp..."
sed -i -e "s/**Last Updated:.*/**Last Updated: $TIMESTAMP/" "$PROJECT_ROOT/ROADMAP.md"

# Validate GitHub folder structure
echo "✓ Validating .github folder structure..."
if [ ! -f "$PROJECT_ROOT/.github/AGENTS.md" ]; then
    echo "⚠ Warning: .github/AGENTS.md not found"
fi

if ! ls "$PROJECT_ROOT"/.github/agents/*.agent.md > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/agents/*.agent.md files found"
fi

if ! ls "$PROJECT_ROOT"/.github/skills/*/SKILL.md > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/skills/*/SKILL.md files found"
fi

if ! ls "$PROJECT_ROOT"/.github/prompts/*.prompt.md > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/prompts/*.prompt.md files found"
fi

if ! ls "$PROJECT_ROOT"/.github/instructions/*.instructions.md > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/instructions/*.instructions.md files found"
fi

if ! ls "$PROJECT_ROOT"/.github/hooks/*.json > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/hooks/*.json files found"
fi

if [ ! -f "$PROJECT_ROOT/TEAM_OPERATING_MODEL.md" ]; then
    echo "⚠ Warning: TEAM_OPERATING_MODEL.md not found"
fi

if ! ls "$PROJECT_ROOT"/.github/ISSUE_TEMPLATE/*.md > /dev/null 2>&1; then
    echo "⚠ Warning: no .github/ISSUE_TEMPLATE/*.md files found"
fi

if [ ! -f "$PROJECT_ROOT/.github/pull_request_template.md" ]; then
    echo "⚠ Warning: .github/pull_request_template.md not found"
fi

# Validate tech stack consistency
echo "✓ Checking tech stack consistency..."
if ! grep -q "Node.js" "$PROJECT_ROOT/PLAN.md"; then
    echo "⚠ Warning: PLAN.md might be outdated (check Node.js mention)"
fi

if ! grep -q "pnpm" "$PROJECT_ROOT/PLAN.md"; then
    echo "⚠ Warning: PLAN.md might be outdated (check pnpm mention)"
fi

echo ""
echo "✅ Documentation validation complete!"
echo "   - Last Updated: $TIMESTAMP"
echo "   - PLAN.md: OK"
echo "   - ROADMAP.md: OK"
echo "   - .github structure: Checked"
echo ""
echo "📝 Next: Stage changes with 'git add PLAN.md ROADMAP.md'"
