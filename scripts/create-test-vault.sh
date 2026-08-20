#!/usr/bin/env bash
set -euo pipefail

VAULT_DIR="${1:-./test-vault}"

echo "Initializing test vault at: ${VAULT_DIR}"
mkdir -p "${VAULT_DIR}/inbox"
mkdir -p "${VAULT_DIR}/projects"
mkdir -p "${VAULT_DIR}/knowledge"
mkdir -p "${VAULT_DIR}/attachments"

cat << 'EOF' > "${VAULT_DIR}/inbox/welcome.md"
# Welcome to Note Web

This is your first note in **Note Web**.

- Typora-like IR instant rendering.
- Markdown files are the single source of truth on disk.
- Automatic save with conflict prevention.
EOF

cat << 'EOF' > "${VAULT_DIR}/projects/example.md"
# Project Example

This is a project notes markdown file.
EOF

touch "${VAULT_DIR}/knowledge/.gitkeep"
touch "${VAULT_DIR}/attachments/.gitkeep"

echo "Test vault initialized successfully."
