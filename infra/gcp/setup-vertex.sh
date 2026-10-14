#!/usr/bin/env bash
# Donne à la VM une identité dédiée "pause-app" qui peut UNIQUEMENT appeler Gemini (Vertex AI).
# → l'assistant IA marche sans aucune clé API : le serveur demande un jeton temporaire (1 h)
#   au metadata server de Google Cloud.
# Remplace le compte de service par défaut de Compute Engine (rôle Éditeur sur tout le projet).
# ⚠ Arrête la VM ~1 min (obligatoire pour changer son compte de service). À lancer une seule fois.
#   bash infra/gcp/setup-vertex.sh
set -euo pipefail

PROJECT=pause-demo-3zbux5
ZONE=europe-west9-b
VM=pause-vm
SA_NAME=pause-app
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
DEPLOY_SA="github-deploy@$PROJECT.iam.gserviceaccount.com"

echo "▶ API Vertex AI"
gcloud services enable aiplatform.googleapis.com --project "$PROJECT"

echo "▶ Compte de service de l'app (un seul droit : appeler Gemini)"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "App Pause (VM) — Vertex AI uniquement"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/aiplatform.user --condition=None --quiet >/dev/null
# La CD (OS Login) doit pouvoir se connecter à une VM qui tourne avec ce compte
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser --quiet >/dev/null

CURRENT=$(gcloud compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" --format='value(serviceAccounts[0].email)')
if [ "$CURRENT" != "$SA" ]; then
  echo "▶ Changement d'identité de la VM ($CURRENT → $SA) : arrêt ~1 min"
  gcloud compute instances stop "$VM" --zone "$ZONE" --project "$PROJECT"
  gcloud compute instances set-service-account "$VM" --zone "$ZONE" --project "$PROJECT" \
    --service-account "$SA" --scopes cloud-platform # les droits réels sont limités par le rôle IAM ci-dessus
  gcloud compute instances start "$VM" --zone "$ZONE" --project "$PROJECT"
fi

echo "✔ Terminé. Sur la VM, mettre VERTEX_PROJECT=$PROJECT dans /opt/pause/.env"
