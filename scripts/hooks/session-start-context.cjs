#!/usr/bin/env node

const response = {
  continue: true,
  systemMessage:
    "Workspace reminder: use pnpm for JS dependencies, keep docs synchronized with major changes, and prefer domain agents from .github/agents for focused tasks."
};

process.stdout.write(JSON.stringify(response));
