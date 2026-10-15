# Les API Google utilisées par le projet. disable_on_destroy = false : retirer une ligne d'ici
# ne coupe jamais un service en production.
locals {
  apis = [
    "run.googleapis.com",              # Cloud Run (app + job de migrations)
    "sqladmin.googleapis.com",         # Cloud SQL
    "artifactregistry.googleapis.com", # images Docker
    "secretmanager.googleapis.com",    # secrets
    "storage.googleapis.com",          # photos
    "iam.googleapis.com",              # comptes de service
    "iamcredentials.googleapis.com",   # jetons temporaires (CI sans clé)
    "sts.googleapis.com",              # échange du jeton OIDC de GitHub
    "aiplatform.googleapis.com",       # Gemini via Vertex AI
    "places.googleapis.com",           # Google Places
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}
