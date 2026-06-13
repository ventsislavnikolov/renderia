FROM node:26-bookworm

# Install system dependencies. gh is the backlog manager — the agent lists and
# closes GitHub issues with it (authenticated via GH_TOKEN from .sandcastle/.env).
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  gh \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm as a real global binary — the corepack shim re-downloads at
# runtime (root's build cache is invisible to the runtime UID) and dies on
# its interactive prompt.
RUN npm install -g pnpm@11.5.2

# Rename the base image's "node" user (UID 1000) to "agent".
# This keeps UID 1000 so that --userns=keep-id (Podman) and
# --user 1000:1000 (Docker) map to the correct home directory owner.
RUN usermod -d /home/agent -m -l agent node
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# On macOS hosts Docker runs the container as the host UID (e.g. 501), not
# 1000, so /home/agent must be writable by any user.
USER root
RUN chmod -R a+rwX /home/agent
USER agent

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
