#!/usr/bin/env bash
# Droits Google Cloud pour l'app sur Cloud Run et pour son déploiement par GitHub Actions,
# plus les réglages de sécurité de la base et le nettoyage des vieilles images.
# À lancer une seule fois, par le propriétaire du projet (relançable sans risque).
#   bash infra/gcp/setup-cloudrun.sh
#
# Architecture (région europe-west9, Paris) :
#   - Cloud Run "pause"          : l'app → https://pause-572691549135.europe-west9.run.app
#   - Cloud Run job "pause-migrate" : migrations + seed, lancé par la CD avant chaque déploiement
#   - Cloud SQL "pause-db"       : Postgres 16, rôles pause_migrator / pause_app comme en local (db/init.sh).
#                                  Aucun réseau autorisé : accès seulement via le connecteur Cloud SQL (IAM).
#   - Bucket "<projet>-photos"   : les photos, monté dans le conteneur sur /app/uploads
#   - Secret Manager             : pause-database-url, pause-migrate-database-url, pause-jwt-secret
#
# Comptes de service (droits minimum) :
#   - pause-app       : l'app. Vertex AI (setup-vertex.sh), connecteur Cloud SQL, photos, ses 2 secrets.
#   - pause-migrator  : le job de migrations. Connecteur Cloud SQL + les 2 URL de base.
#   - github-deploy   : la CD (setup-cicd.sh). Pousse les images, déploie le service et le job.
set -euo pipefail

PROJECT=pause-demo-3zbux5
REGION=europe-west9
APP_SA="pause-app@$PROJECT.iam.gserviceaccount.com"
MIG_SA="pause-migrator@$PROJECT.iam.gserviceaccount.com"
DEPLOY_SA="github-deploy@$PROJECT.iam.gserviceaccount.com"

secret_access() { # secret_access <secret> <compte>
  gcloud secrets add-iam-policy-binding "$1" --project "$PROJECT" \
    --member "serviceAccount:$2" --role roles/secretmanager.secretAccessor --quiet >/dev/null
}

echo "▶ APIs nécessaires"
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com --project "$PROJECT"

echo "▶ App (pause-app) : base, photos, secrets"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$APP_SA" \
  --role roles/cloudsql.client --condition=None --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$PROJECT-photos" --member "serviceAccount:$APP_SA" \
  --role roles/storage.objectUser >/dev/null
secret_access pause-database-url "$APP_SA"
secret_access pause-jwt-secret "$APP_SA"

echo "▶ Migrations (pause-migrator) : base + URL de connexion (le compte app n'a PAS le mot de passe du migrator)"
gcloud iam service-accounts describe "$MIG_SA" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create pause-migrator --project "$PROJECT" --display-name "Pause — migrations de la base"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$MIG_SA" \
  --role roles/cloudsql.client --condition=None --quiet >/dev/null
secret_access pause-migrate-database-url "$MIG_SA"
secret_access pause-database-url "$MIG_SA" # le seed écrit avec le compte app

echo "▶ CD GitHub (github-deploy) : images + déploiement Cloud Run"
gcloud artifacts repositories add-iam-policy-binding pause --location "$REGION" --project "$PROJECT" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/run.developer --condition=None --quiet >/dev/null
# Déployer un service/job qui tourne sous un compte de service = avoir le droit de "l'utiliser"
for SA in "$APP_SA" "$MIG_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
    --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser --quiet >/dev/null
done

echo "▶ Base Cloud SQL : sauvegarde chaque nuit (7 gardées), protection anti-suppression, TLS obligatoire"
gcloud sql instances patch pause-db --project "$PROJECT" --backup-start-time 02:00 --retained-backups-count 7 \
  --deletion-protection --ssl-mode ENCRYPTED_ONLY --quiet

echo "▶ Images : on garde les 10 dernières, le reste est supprimé après 7 jours"
POLICY=$(mktemp); trap 'rm -f "$POLICY"' EXIT
cat > "$POLICY" <<'JSON'
[
  {"name": "garder-les-10-dernieres", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 10}},
  {"name": "supprimer-le-reste-apres-7-jours", "action": {"type": "Delete"}, "condition": {"tagState": "any", "olderThan": "7d"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies pause --location "$REGION" --project "$PROJECT" \
  --policy "$POLICY" --no-dry-run >/dev/null

echo "✔ Droits en place. Le prochain push sur main déploie sur Cloud Run."
