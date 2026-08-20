# Note Web

A lightweight Typora-style browser Markdown notes editor that preserves your local Markdown vault as the single source of truth.

## Features

- Left file tree with nested folder navigation
- Instant rendering with Vditor IR mode
- Atomic direct file persistence to Markdown files (no database)
- Autosave with 1200ms debounce and Ctrl/Cmd+S manual save
- Revision conflict detection (HTTP 409) preventing silent overwrite
- File operations: create note, create folder, rename, move, delete
- Quick open (Ctrl/Cmd+P) and full-text search (Ctrl/Cmd+K)
- Image asset upload and relative path embedding
- Light / Dark themes and custom external CSS / font support
- Docker deployment with non-root user and single-port hosting

## Development

```bash
# Install dependencies
npm install

# Run dev mode (Web + Server)
npm run dev

# Run tests
npm test

# Typecheck
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```
