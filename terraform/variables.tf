# Rien de secret ici : les valeurs des secrets (mots de passe, JWT) ne passent jamais par Terraform,
# sinon elles finiraient en clair dans l'état. Terraform crée les "boîtes" Secret Manager, pas leur contenu.

variable "project_id" {
  description = "Projet Google Cloud"
  type        = string
  default     = "pause-demo-3zbux5"
}

variable "region" {
  description = "Région de tout le projet (Paris)"
  type        = string
  default     = "europe-west9"
}

variable "github_repo" {
  description = "Seul dépôt GitHub autorisé à déployer (Workload Identity Federation)"
  type        = string
  default     = "rparone2iim/pause"
}

variable "site_url" {
  description = "URL publique du service Cloud Run (APP_ORIGIN : seule origine acceptée par l'API)"
  type        = string
  default     = "https://pause-572691549135.europe-west9.run.app"
}
