# PostgreSQL 16 managé. Aucun réseau autorisé : on n'y entre que par le connecteur Cloud SQL (IAM),
# connexions chiffrées obligatoires, sauvegarde chaque nuit, protégée contre la suppression.
# Les rôles Postgres pause_migrator / pause_app (et leurs mots de passe) sont créés par db/init.sh,
# pas par Terraform : leurs mots de passe finiraient sinon en clair dans l'état.
resource "google_sql_database_instance" "db" {
  name                = "pause-db"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  settings {
    tier                        = "db-f1-micro"
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    deletion_protection_enabled = true
    enable_dataplex_integration = true

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true # IP publique sans aucun réseau autorisé : seul le connecteur IAM passe
      # Chiffrement obligatoire. Pas de certificat client exigé : la seule entrée est le connecteur Cloud SQL
      # de Cloud Run, authentifié par IAM et chiffré de bout en bout (TRUSTED_CLIENT_CERTIFICATE_REQUIRED : à tester avant).
      # nosemgrep: terraform.gcp.security.gcp-sql-database-ssl-insecure-value-postgres-mysql.gcp-sql-database-ssl-insecure-value-postgres-mysql
      ssl_mode = "ENCRYPTED_ONLY"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_database" "pause" {
  name     = "pause"
  instance = google_sql_database_instance.db.name
}
