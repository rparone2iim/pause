# Moindre privilège : un compte de service par rôle, chacun avec le strict minimum.
#  - pause-app       : l'application. Gemini, connecteur Cloud SQL, ses 2 secrets, les photos.
#  - pause-migrator  : le job de migrations. Connecteur Cloud SQL + les 2 URL de base.
#  - github-deploy   : la CD. Pousser les images, déployer le service et le job. Rien d'autre.

resource "google_service_account" "app" {
  account_id   = "pause-app"
  display_name = "Pause — application (Cloud Run)"
}

resource "google_service_account" "migrator" {
  account_id   = "pause-migrator"
  display_name = "Pause — migrations de la base"
}

resource "google_service_account" "deployer" {
  account_id   = "github-deploy"
  display_name = "GitHub Actions — déploiement"
}

locals {
  project_roles = {
    "app-vertex"        = { role = "roles/aiplatform.user", member = google_service_account.app.member }
    "app-cloudsql"      = { role = "roles/cloudsql.client", member = google_service_account.app.member }
    "migrator-cloudsql" = { role = "roles/cloudsql.client", member = google_service_account.migrator.member }
    "deployer-run"      = { role = "roles/run.developer", member = google_service_account.deployer.member }
  }
}

resource "google_project_iam_member" "roles" {
  for_each = local.project_roles
  project  = var.project_id
  role     = each.value.role
  member   = each.value.member
}

# Déployer un service ou un job qui tourne sous un compte de service = avoir le droit de "l'utiliser".
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each           = { app = google_service_account.app.name, migrator = google_service_account.migrator.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}

# --- CI/CD sans clé : Workload Identity Federation ---
# GitHub présente un jeton OIDC signé ("je suis rparone2iim/pause, branche main") ;
# Google le vérifie et prête le compte github-deploy pour 1 h. Aucune clé à voler dans GitHub.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repo}' && assertion.ref == 'refs/heads/main'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
