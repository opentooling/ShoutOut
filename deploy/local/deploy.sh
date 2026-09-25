#!/usr/bin/env bash
# Build ShoutOut images and deploy the full stack to a local k3d cluster.
#   deploy/local/deploy.sh            build + deploy + helm test
#   SKIP_BUILD=1 deploy/local/deploy.sh   redeploy the last built tag
#   RESET_KEYCLOAK_REALM=1 deploy/local/deploy.sh   re-import the realm (picks up realm changes)
#   SKIP_SECURITY_SCAN=1 deploy/local/deploy.sh     skip the npm audit + Trivy image scan
#   GHCR_TAG=main deploy/local/deploy.sh    deploy the image CI published to GHCR instead of building
#                                           (any published tag: main, latest, sha-<commit>)
set -euo pipefail

CLUSTER="${CLUSTER:-shoutout}"
NAMESPACE="${NAMESPACE:-shoutout}"
RELEASE="${RELEASE:-shoutout}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG_FILE="$ROOT/deploy/local/.last-tag"

log() { printf '\033[1;36m==> %s\033[0m\n' "$*"; }

if ! k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  log "Creating k3d cluster '$CLUSTER'"
  k3d cluster create "$CLUSTER" --agents 1 -p "80:80@loadbalancer" -p "443:443@loadbalancer" --wait
fi
kubectl config use-context "k3d-$CLUSTER" >/dev/null

# Pods must reach Keycloak at the same issuer URL the browser uses, but
# *.localtest.me resolves to 127.0.0.1. Point it at the Traefik ingress instead.
log "Configuring in-cluster DNS for auth.localtest.me"
until TRAEFIK_IP="$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}' 2>/dev/null)" && [[ -n "$TRAEFIK_IP" ]]; do
  sleep 2
done
kubectl apply -f - >/dev/null <<YAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns-custom
  namespace: kube-system
data:
  shoutout.server: |
    auth.localtest.me:53 {
      hosts {
        $TRAEFIK_IP auth.localtest.me
      }
    }
YAML
kubectl -n kube-system rollout restart deployment coredns >/dev/null
kubectl -n kube-system rollout status deployment coredns --timeout=120s >/dev/null

IMAGE_ARGS=()
if [[ -n "${GHCR_TAG:-}" ]]; then
  TAG="$GHCR_TAG"
  IMAGE="ghcr.io/opentooling/shoutout:$TAG"
  log "Using published image $IMAGE (no local build)"
  # Fail early with a clear message rather than a pod stuck in ImagePullBackOff.
  first_node="$(k3d node list --no-headers | awk -v c="$CLUSTER" '$3==c && $2=="server" {print $1; exit}')"
  if ! docker exec "$first_node" crictl pull "$IMAGE" >/dev/null; then
    echo "Could not pull $IMAGE from the cluster. Has CI published it, and is the package public?" >&2
    exit 1
  fi
  IMAGE_ARGS=(
    --set app.image.repository=ghcr.io/opentooling/shoutout
    --set app.image.pullPolicy=Always
    # Moving tags like "main" keep the same name; force new pods so they pull again.
    --set-string app.podAnnotations.shoutout/deployed-at="$(date +%s)"
  )
elif [[ -z "${SKIP_BUILD:-}" ]]; then
  TAG="$(git -C "$ROOT" rev-parse --short HEAD)-$(date +%s)"
  log "Building images (tag $TAG)"
  BUILD_LOG="$(mktemp)"
  if ! docker build -t "shoutout:$TAG" "$ROOT" >"$BUILD_LOG" 2>&1; then
    tail -40 "$BUILD_LOG"
    echo "Image build failed (full log: $BUILD_LOG)" >&2
    exit 1
  fi
  if [[ -z "${SKIP_SECURITY_SCAN:-}" ]]; then
    "$ROOT/scripts/security-scan.sh" "shoutout:$TAG"
  fi
  for node in $(k3d node list --no-headers | awk -v c="$CLUSTER" '$3==c && ($2=="server" || $2=="agent") {print $1}'); do
    log "Importing images into $node"
    docker save "shoutout:$TAG" | docker exec -i "$node" ctr -n k8s.io images import - >/dev/null
  done
  echo "$TAG" > "$TAG_FILE"

  # Old builds fill the Podman/Docker VM disk, and kubelet then garbage-collects
  # images (causing ErrImageNeverPull). Keep only the image being deployed.
  log "Removing older ShoutOut images"
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep -E '(^|/)shoutout(-migrate)?:' | grep -v ":$TAG\$" \
    | xargs -r docker rmi -f >/dev/null 2>&1 || true
  # Untagged build-stage images from our Dockerfile (labelled) are large; remove them too.
  # (The Docker CLI against Podman ignores combined filters, so prefer podman.)
  images_cli="$(command -v podman || command -v docker)"
  "$images_cli" images --filter dangling=true --filter label=org.shoutout.build=true -q \
    | xargs -r "$images_cli" rmi -f >/dev/null 2>&1 || true
  for node in $(k3d node list --no-headers | awk -v c="$CLUSTER" '$3==c && ($2=="server" || $2=="agent") {print $1}'); do
    docker exec "$node" sh -c "crictl images -o json | grep -o '\"docker.io/library/shoutout[^\"]*\"' | tr -d '\"' | grep -v ':$TAG\$' | xargs -r -n1 crictl rmi" >/dev/null 2>&1 || true
  done
else
  TAG="$(cat "$TAG_FILE")"
fi

KEYCLOAK_DEPLOY="$RELEASE-keycloak"
if [[ -n "${RESET_KEYCLOAK_REALM:-}" ]] && kubectl -n "$NAMESPACE" get deploy "$KEYCLOAK_DEPLOY" >/dev/null 2>&1; then
  log "Deleting the Keycloak realm so it is re-imported"
  ADMIN_PASSWORD="$(kubectl -n "$NAMESPACE" get secret "$RELEASE-secrets" -o jsonpath='{.data.keycloak-admin-password}' | base64 -d)"
  # Use a running pod: after evictions, "deploy/<name>" can resolve to a failed one.
  KEYCLOAK_POD="$(kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/component=keycloak \
    --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')"
  kubectl -n "$NAMESPACE" exec "$KEYCLOAK_POD" -- sh -c \
    "/opt/keycloak/bin/kcadm.sh config credentials --config /tmp/kcadm.config --server http://localhost:8080 --realm master --user admin --password '$ADMIN_PASSWORD' \
     && /opt/keycloak/bin/kcadm.sh delete realms/shoutout --config /tmp/kcadm.config" || true
fi

log "Deploying Helm release '$RELEASE' to namespace '$NAMESPACE'"
helm upgrade --install "$RELEASE" "$ROOT/deploy/helm/shoutout" \
  --namespace "$NAMESPACE" --create-namespace \
  -f "$ROOT/deploy/local/values-local.yaml" \
  --set app.image.tag="$TAG" \
  ${IMAGE_ARGS[@]+"${IMAGE_ARGS[@]}"} \
  --wait --timeout 10m

if [[ -n "${RESET_KEYCLOAK_REALM:-}" ]]; then
  kubectl -n "$NAMESPACE" rollout restart "deploy/$KEYCLOAK_DEPLOY" >/dev/null
  kubectl -n "$NAMESPACE" rollout status "deploy/$KEYCLOAK_DEPLOY" --timeout=5m >/dev/null
fi

log "Running Helm tests"
helm test "$RELEASE" -n "$NAMESPACE"

kubectl -n "$NAMESPACE" get pods
log "ShoutOut:  http://shoutout.localtest.me"
log "Keycloak:  http://auth.localtest.me  (demo users: alice[admin], bob, carol... password: shoutout)"
log "Mailpit:   http://mail.localtest.me  (emails the app sends)"
