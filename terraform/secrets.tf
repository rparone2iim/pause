# Les "boîtes" Secret Manager, répliquées uniquement à Paris. Leur CONTENU est ajouté hors Terraform
# (gcloud secrets versions add …) : un secret ne doit jamais apparaître dans le code ni dans l'état Terraform.
locals {
  secrets = ["pause-database-url", "pause-migrate-database-url", "pause-jwt-secret", "pause-db-root-password"]

  # Qui peut lire quoi : l'app n'a PAS le mot de passe du migrator, personne n'a celui de postgres.
  secret_readers = {
    "app-database-url"      = { secret = "pause-database-url", member = google_service_account.app.member }
    "app-jwt-secret"        = { secret = "pause-jwt-secret", member = google_service_account.app.member }
    "migrator-migrate-url"  = { secret = "pause-migrate-database-url", member = google_service_account.migrator.member }
    "migrator-database-url" = { secret = "pause-database-url", member = google_service_account.migrator.member } # le seed écrit avec le compte app
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secrets)
  secret_id = each.value
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "readers" {
  for_each  = local.secret_readers
  secret_id = google_secret_manager_secret.secrets[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
