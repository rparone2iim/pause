#!/usr/bin/env bash
# Configure Google Cloud pour que GitHub Actions puisse déployer SANS clé stockée
# (Workload Identity Federation). À lancer une seule fois, par le propriétaire du projet.
#   bash infra/gcp/setup-cicd.sh
#
# Principe : à chaque exécution, GitHub fournit un jeton OIDC signé qui dit
# « je suis le dépôt rparone2iim/pause, branche main ». Google le vérifie et donne
# un accès temporaire (1 h) au compte de service "github-deploy". Rien à voler dans GitHub.
set -euo pipefail

PROJECT=pause-demo-3zbux5
REPO=rparone2iim/pause
ZONE=europe-west9-b
VM=pause-vm
SA_NAME=github-deploy
POOL=github
PROVIDER=github

SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
VM_SA=$(gcloud compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" --format='value(serviceAccounts[0].email)')

echo "▶ APIs nécessaires"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  iap.googleapis.com oslogin.googleapis.com --project "$PROJECT"

echo "▶ Compte de service de déploiement (droits minimum)"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "GitHub Actions — déploiement"
for ROLE in roles/compute.viewer roles/compute.osAdminLogin roles/iap.tunnelResourceAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$ROLE" --condition=None --quiet >/dev/null
done
# Obligatoire pour se connecter (OS Login) à une VM qui a elle-même un compte de service
gcloud iam service-accounts add-iam-policy-binding "$VM_SA" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser --quiet >/dev/null

echo "▶ OS Login sur la VM (clés SSH liées aux identités Google, plus de clés dans les métadonnées)"
gcloud compute instances add-metadata "$VM" --zone "$ZONE" --project "$PROJECT" --metadata enable-oslogin=TRUE

echo "▶ Workload Identity Federation (GitHub → Google)"
gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --project "$PROJECT" --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool "$POOL" --location global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool "$POOL" \
    --location global --project "$PROJECT" --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '$REPO' && assertion.ref == 'refs/heads/main'"
# Seul CE dépôt, sur la branche main, peut emprunter le compte de service
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" \
  --quiet >/dev/null

echo
echo "✔ Terminé. Variables à mettre dans GitHub (Settings → Secrets and variables → Actions → Variables) :"
echo "  GCP_WIF_PROVIDER = projects/$NUM/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "  GCP_DEPLOY_SA    = $SA"
