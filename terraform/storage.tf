# Les photos des spots : bucket privé (jamais public), monté dans le conteneur sur /app/uploads.
# L'app les ressert elle-même via /api/v1/photos/:name.
resource "google_storage_bucket" "photos" {
  name                        = "${var.project_id}-photos"
  location                    = upper(var.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  soft_delete_policy {
    retention_duration_seconds = 604800 # une photo supprimée par erreur reste récupérable 7 jours
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "app_photos" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectUser"
  member = google_service_account.app.member
}
