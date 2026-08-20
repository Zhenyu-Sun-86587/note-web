# AGENTS.md

## Development Guidance for Note Web

- Single source of truth is always the Markdown vault files on disk.
- Do not add databases, ORMs, message queues, WebSockets, or background sync queues to the core.
- Tests must use isolated temporary directories and must never touch `/srv/notes`.
- Security boundary: paths must be validated strictly against `VAULT_ROOT`. No absolute paths, no `..`, no hidden files, no `.git`, no symlinks.
- Follow the phase order defined in `note-web-agent-development-plan.md`.
