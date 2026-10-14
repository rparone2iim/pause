#!/usr/bin/env bash
# Exécuté SUR la VM (par la CD GitHub Actions ou par scripts/deploy-gcp.sh).
# Installe une archive du code dans /opt/pause, reconstruit et relance les conteneurs,
# puis vérifie que l'app répond. Le .env de prod, la base et les photos sont conservés.
#   Usage : bash remote-deploy.sh /tmp/pause.tgz [revision]
set -euo pipefail
ARCHIVE="${1:?archive manquante}"
REVISION="${2:-manuel}"
APP_DIR=/opt/pause
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE" "$ARCHIVE"' EXIT

echo "▶ Installation du code ($REVISION)"
tar -xzf "$ARCHIVE" -C "$STAGE"
# --delete : un fichier supprimé du dépôt disparaît aussi du serveur (sauf le .env de prod)
sudo rsync -a --delete --exclude=.env "$STAGE"/ "$APP_DIR"/
echo "$REVISION" | sudo tee "$APP_DIR/.revision" >/dev/null

echo "▶ Build + redémarrage (migrations appliquées par le service migrate)"
cd "$APP_DIR"
sudo docker compose up -d --build --remove-orphans
sudo docker image prune -f >/dev/null

echo "▶ Vérification de l'app"
for _ in $(seq 1 30); do
  if sudo docker compose exec -T app node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    sudo docker compose ps --format 'table {{.Service}}\t{{.Status}}'
    echo "✔ Déployé : $REVISION"
    exit 0
  fi
  sleep 2
done
echo "✘ L'app ne répond pas" >&2
sudo docker compose logs --tail 50 app >&2
exit 1
