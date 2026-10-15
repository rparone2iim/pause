# Images Docker (app + migrations), taguées avec le hash du commit par la CD.
resource "google_artifact_registry_repository" "images" {
  repository_id = "pause"
  location      = var.region
  format        = "DOCKER"
  description   = "Images de l'app Pause"

  # On garde les 10 dernières images (retour arrière possible), le reste disparaît après 7 jours.
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "garder-les-10-dernieres"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "supprimer-le-reste-apres-7-jours"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s"
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "deployer_pushes" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}
