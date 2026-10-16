# L'application et le job de migrations. L'IMAGE n'est pas gérée ici : la CD la remplace à chaque
# déploiement (hash du commit), d'où ignore_changes. Tout le reste (compte, secrets, base, photos, limites)
# vient de ce fichier.
locals {
  images = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

resource "google_cloud_run_v2_service" "app" {
  name                = "pause"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true
  # Site public : pas de contrôle IAM à l'entrée (l'API protège elle-même ses routes privées).
  invoker_iam_disabled = true

  template {
    service_account                  = google_service_account.app.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "300s"
    max_instance_request_concurrency = 80

    # Une seule instance : le rate limit est en mémoire (un rate limit partagé demanderait Redis / Cloud Armor).
    scaling {
      max_instance_count = 1
    }

    volumes {
      name = "photos"
      gcs {
        bucket        = google_storage_bucket.photos.name
        read_only     = false
        mount_options = ["uid=1000", "gid=1000"] # l'utilisateur "node" de l'image, non-root
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.db.connection_name]
      }
    }

    containers {
      image = "${local.images}/app:latest"

      ports {
        name           = "http1"
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        startup_cpu_boost = true
        cpu_idle          = true # CPU facturé seulement pendant les requêtes
      }

      env {
        name  = "APP_ORIGIN"
        value = var.site_url
      }
      env {
        name  = "UPLOAD_DIR"
        value = "/app/uploads"
      }
      env {
        name  = "TRUST_PROXY"
        value = "true" # Cloud Run ajoute la vraie IP client à la fin de X-Forwarded-For
      }
      env {
        name  = "VERTEX_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_LOCATION"
        value = "global"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["pause-database-url"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["pause-jwt-secret"].secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "photos"
        mount_path = "/app/uploads"
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    ignore_changes = [client, client_version, template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.readers, google_storage_bucket_iam_member.app_photos]
}

# Même chose côté IAM : tout le monde peut appeler le service.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Migrations + données de démo, lancées par la CD AVANT chaque nouvelle version de l'app.
resource "google_cloud_run_v2_job" "migrate" {
  name                = "pause-migrate"
  location            = var.region
  deletion_protection = true

  template {
    template {
      service_account       = google_service_account.migrator.email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "600s"
      max_retries           = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.db.connection_name]
        }
      }

      containers {
        image = "${local.images}/migrate:latest"

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        env {
          name = "MIGRATE_DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["pause-migrate-database-url"].secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["pause-database-url"].secret_id
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [client, client_version, template[0].template[0].containers[0].image]
  }

  depends_on = [google_secret_manager_secret_iam_member.readers]
}
