#!/usr/bin/env bash
# ==============================================================================
# note-web Deployment Script
# 
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --docker        (Default) Build Docker image and deploy via compose.prod.yml
#   --local         Build locally and print Node.js production run command
#   --pm2           Build locally and restart via PM2
#   --push          Push current branch to git remote origin
#   --check         Run tests and typecheck before deployment
#   --all           Run checks, push to remote, and deploy Docker container
#   --help, -h      Show this help message
# ==============================================================================

set -euo pipefail

# Project root directory detection
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_ROOT}"

# Color codes
CLR_RESET="\033[0m"
CLR_BOLD="\033[1m"
CLR_GREEN="\033[32m"
CLR_BLUE="\033[34m"
CLR_YELLOW="\033[33m"
CLR_RED="\033[31m"
CLR_CYAN="\033[36m"

log_info() {
    echo -e "${CLR_BLUE}[INFO]${CLR_RESET} $1"
}

log_success() {
    echo -e "${CLR_GREEN}[SUCCESS]${CLR_RESET} $1"
}

log_warn() {
    echo -e "${CLR_YELLOW}[WARN]${CLR_RESET} $1"
}

log_error() {
    echo -e "${CLR_RED}[ERROR]${CLR_RESET} $1"
}

show_help() {
    cat << "EOF"
note-web Deployment Utility

Usage:
  ./deploy.sh [OPTIONS]

Options:
  --docker        Build Docker image and restart container (Default)
  --local         Build project locally and print Node.js production run command
  --pm2           Build project locally and reload/start via PM2
  --push          Push current branch to remote Git repository
  --check         Run test suite and type check
  --all           Run checks -> push to remote -> deploy Docker container
  -h, --help      Display this help message

Examples:
  ./deploy.sh                   # Standard Docker deployment
  ./deploy.sh --check --docker  # Run tests first, then deploy Docker
  ./deploy.sh --push            # Push current branch to remote
  ./deploy.sh --local           # Local Node.js build & run
EOF
}

# Run test suite and typecheck
run_checks() {
    log_info "Running test suite and type checking..."
    npm test
    npm run typecheck
    log_success "All tests and type checks passed!"
}

# Push current branch to git remote
push_to_remote() {
    local CURRENT_BRANCH
    CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    log_info "Pushing branch '${CURRENT_BRANCH}' to remote origin..."
    git push origin "${CURRENT_BRANCH}"
    log_success "Successfully pushed branch '${CURRENT_BRANCH}' to origin."
}

# Build and deploy via Docker
deploy_docker() {
    log_info "Starting Docker deployment for note-web..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not available in PATH."
        exit 1
    fi

    # 1. Build image
    log_info "Step 1/3: Building Docker image 'note-web:latest'..."
    docker build -t note-web:latest -f docker/Dockerfile .
    log_success "Docker image built successfully."

    # 2. Recreate container
    log_info "Step 2/3: Recreating and starting production container..."
    docker compose -f docker/compose.prod.yml up -d --force-recreate
    log_success "Container started."

    # 3. Health check
    log_info "Step 3/3: Waiting for health check verification on http://127.0.0.1:3080/api/health..."
    local MAX_RETRIES=15
    local COUNT=0
    local HEALTH_URL="http://127.0.0.1:3080/api/health"
    
    while [ $COUNT -lt $MAX_RETRIES ]; do
        sleep 2
        COUNT=$((COUNT + 1))
        if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
            log_success "Health check passed! note-web is live and healthy on http://127.0.0.1:3080"
            return 0
        fi
        echo -n "."
    done

    echo ""
    log_warn "Health check endpoint did not respond within expected time. Please check logs:"
    echo "  docker compose -f docker/compose.prod.yml logs --tail 50 note-web"
}

# Local build
build_local() {
    log_info "Building production bundles (Web & Server)..."
    npm run build
    log_success "Production build completed."
}

# Local Node deployment
deploy_local() {
    build_local
    log_info "Starting note-web locally with Node.js..."
    echo -e "${CLR_BOLD}Run the following command to start production server:${CLR_RESET}"
    echo '  NODE_ENV=production \'
    echo '  HOST=127.0.0.1 \'
    echo '  PORT=3000 \'
    echo '  VAULT_ROOT=/srv/notes \'
    echo "  CUSTOM_CSS_PATH=${PROJECT_ROOT}/config/custom.css \\"
    echo '  node apps/server/dist/index.js'
    echo ""
}

# PM2 deployment
deploy_pm2() {
    build_local
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 is not installed. Install with: npm install -g pm2"
        exit 1
    fi
    log_info "Reloading note-web with PM2..."
    pm2 restart note-web || pm2 start apps/server/dist/index.js --name note-web --env NODE_ENV=production
    log_success "PM2 deployment finished."
}

# Parse CLI arguments
DO_CHECK=false
DO_PUSH=false
DO_DOCKER=false
DO_LOCAL=false
DO_PM2=false
ACTION_SPECIFIED=false

if [ $# -eq 0 ]; then
    DO_DOCKER=true
    ACTION_SPECIFIED=true
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --check)
            DO_CHECK=true
            ;;
        --push)
            DO_PUSH=true
            ACTION_SPECIFIED=true
            ;;
        --docker)
            DO_DOCKER=true
            ACTION_SPECIFIED=true
            ;;
        --local)
            DO_LOCAL=true
            ACTION_SPECIFIED=true
            ;;
        --pm2)
            DO_PM2=true
            ACTION_SPECIFIED=true
            ;;
        --all)
            DO_CHECK=true
            DO_PUSH=true
            DO_DOCKER=true
            ACTION_SPECIFIED=true
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown argument: $1"
            show_help
            exit 1
            ;;
    esac
    shift
done

# If only --check was specified without deployment target
if [ "${ACTION_SPECIFIED}" = false ] && [ "${DO_CHECK}" = true ]; then
    run_checks
    exit 0
fi

# Execute sequence
if [ "${DO_CHECK}" = true ]; then
    run_checks
fi

if [ "${DO_PUSH}" = true ]; then
    push_to_remote
fi

if [ "${DO_DOCKER}" = true ]; then
    deploy_docker
elif [ "${DO_LOCAL}" = true ]; then
    deploy_local
elif [ "${DO_PM2}" = true ]; then
    deploy_pm2
fi

log_success "Done!"
