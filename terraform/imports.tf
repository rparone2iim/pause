# La prod existait avant Terraform : ces blocs "import" la font ADOPTER par Terraform au premier apply
# (rien n'est recréé ni détruit). `terraform plan` montre alors l'écart entre ce code et la réalité :
# il doit être nul, sinon c'est que quelqu'un a modifié la prod à la main (dérive).
# Une fois le premier apply fait, ce fichier ne sert plus et peut être supprimé.
locals {
  p  = var.project_id
  r  = var.region
  sa = { app = "pause-app", migrator = "pause-migrator", deployer = "github-deploy" }
}

import {
  for_each = toset(local.apis)
  to       = google_project_service.apis[each.value]
  id       = "${local.p}/${each.value}"
}

import {
  to = google_service_account.app
  id = "projects/${local.p}/serviceAccounts/pause-app@${local.p}.iam.gserviceaccount.com"
}
import {
  to = google_service_account.migrator
  id = "projects/${local.p}/serviceAccounts/pause-migrator@${local.p}.iam.gserviceaccount.com"
}
import {
  to = google_service_account.deployer
  id = "projects/${local.p}/serviceAccounts/github-deploy@${local.p}.iam.gserviceaccount.com"
}

import {
  for_each = {
    "app-vertex"        = "roles/aiplatform.user serviceAccount:pause-app@${local.p}.iam.gserviceaccount.com"
    "app-cloudsql"      = "roles/cloudsql.client serviceAccount:pause-app@${local.p}.iam.gserviceaccount.com"
    "migrator-cloudsql" = "roles/cloudsql.client serviceAccount:pause-migrator@${local.p}.iam.gserviceaccount.com"
    "deployer-run"      = "roles/run.developer serviceAccount:github-deploy@${local.p}.iam.gserviceaccount.com"
  }
  to = google_project_iam_member.roles[each.key]
  id = "${local.p} ${each.value}"
}

import {
  for_each = toset(["app", "migrator"])
  to       = google_service_account_iam_member.deployer_acts_as[each.value]
  id       = "projects/${local.p}/serviceAccounts/${local.sa[each.value]}@${local.p}.iam.gserviceaccount.com roles/iam.serviceAccountUser serviceAccount:github-deploy@${local.p}.iam.gserviceaccount.com"
}

import {
  to = google_iam_workload_identity_pool.github
  id = "projects/${local.p}/locations/global/workloadIdentityPools/github"
}
import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/${local.p}/locations/global/workloadIdentityPools/github/providers/github"
}
import {
  to = google_service_account_iam_member.github_impersonates_deployer
  id = "projects/${local.p}/serviceAccounts/github-deploy@${local.p}.iam.gserviceaccount.com roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/572691549135/locations/global/workloadIdentityPools/github/attribute.repository/${var.github_repo}"
}

import {
  to = google_artifact_registry_repository.images
  id = "projects/${local.p}/locations/${local.r}/repositories/pause"
}
import {
  to = google_artifact_registry_repository_iam_member.deployer_pushes
  id = "projects/${local.p}/locations/${local.r}/repositories/pause roles/artifactregistry.writer serviceAccount:github-deploy@${local.p}.iam.gserviceaccount.com"
}

import {
  for_each = toset(local.secrets)
  to       = google_secret_manager_secret.secrets[each.value]
  id       = "projects/${local.p}/secrets/${each.value}"
}
import {
  for_each = {
    "app-database-url"      = "pause-database-url roles/secretmanager.secretAccessor serviceAccount:pause-app@${local.p}.iam.gserviceaccount.com"
    "app-jwt-secret"        = "pause-jwt-secret roles/secretmanager.secretAccessor serviceAccount:pause-app@${local.p}.iam.gserviceaccount.com"
    "migrator-migrate-url"  = "pause-migrate-database-url roles/secretmanager.secretAccessor serviceAccount:pause-migrator@${local.p}.iam.gserviceaccount.com"
    "migrator-database-url" = "pause-database-url roles/secretmanager.secretAccessor serviceAccount:pause-migrator@${local.p}.iam.gserviceaccount.com"
  }
  to = google_secret_manager_secret_iam_member.readers[each.key]
  id = "projects/${local.p}/secrets/${each.value}"
}

import {
  to = google_sql_database_instance.db
  id = "projects/${local.p}/instances/pause-db"
}
import {
  to = google_sql_database.pause
  id = "projects/${local.p}/instances/pause-db/databases/pause"
}

import {
  to = google_storage_bucket.photos
  id = "${local.p}-photos"
}
import {
  to = google_storage_bucket_iam_member.app_photos
  id = "b/${local.p}-photos roles/storage.objectUser serviceAccount:pause-app@${local.p}.iam.gserviceaccount.com"
}

import {
  to = google_cloud_run_v2_service.app
  id = "projects/${local.p}/locations/${local.r}/services/pause"
}
import {
  to = google_cloud_run_v2_service_iam_member.public
  id = "projects/${local.p}/locations/${local.r}/services/pause roles/run.invoker allUsers"
}
import {
  to = google_cloud_run_v2_job.migrate
  id = "projects/${local.p}/locations/${local.r}/jobs/pause-migrate"
}
