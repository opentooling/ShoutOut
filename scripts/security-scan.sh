#!/usr/bin/env bash
# Fails if dependencies or container images have known HIGH/CRITICAL vulnerabilities.
#   scripts/security-scan.sh                     npm audit only
#   scripts/security-scan.sh shoutout:tag ...    npm audit + Trivy scan of the given images
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
log() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }

log "npm audit (high and critical, minus .npm-audit-ignore)"
node "$ROOT/scripts/npm-audit.mjs"

if [[ $# -gt 0 ]]; then
  if ! command -v trivy >/dev/null; then
    echo "trivy is not installed; see https://trivy.dev" >&2
    exit 1
  fi
  for image in "$@"; do
    log "Trivy image scan: $image"
    # Scan the image tarball so it works with Docker and Podman alike.
    tarball="$(mktemp -t trivy-image.XXXXXX).tar"
    docker save "$image" -o "$tarball"
    trivy image --quiet --skip-version-check --table-mode detailed --input "$tarball" \
      --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
      --ignorefile "$ROOT/.trivyignore"
    rm -f "$tarball"
  done
fi

log "No known high or critical vulnerabilities"
