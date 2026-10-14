#!/usr/bin/env bash
# Déploiement MANUEL (secours) : envoie le code local sur la VM Google Cloud.
# En temps normal, c'est la CD GitHub Actions qui déploie à chaque push sur main.
#   Lancer :  bash scripts/deploy-gcp.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VM=pause-vm
ZONE=europe-west9-b
PROJECT=pause-demo-3zbux5
TGZ=$(mktemp -t pause).tgz
trap 'rm -f "$TGZ"' EXIT

echo "▶ Archive du code (sans node_modules, .next, uploads, .env)"
COPYFILE_DISABLE=1 tar --no-xattrs --exclude=node_modules --exclude=.next --exclude=uploads --exclude=.git \
  --exclude='.env' --exclude='.env.local' --exclude='*.log' --exclude='.DS_Store' -czf "$TGZ" .

echo "▶ Envoi + rebuild sur la VM (une seule connexion SSH, tunnel IAP)"
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" --tunnel-through-iap --quiet < "$TGZ" \
  --command "cat > /tmp/pause.tgz && tar -xzOf /tmp/pause.tgz ./scripts/remote-deploy.sh | bash -s -- /tmp/pause.tgz manuel-$(date +%Y%m%d-%H%M)"

echo "✔ En ligne : https://34-155-60-223.sslip.io"
