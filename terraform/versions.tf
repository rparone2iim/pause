# Infrastructure as Code de Pause : toute la prod Google Cloud est décrite ici, rien n'est créé à la main.
#   terraform init      → télécharge le provider Google, se branche sur l'état partagé (bucket GCS)
#   terraform plan      → montre ce qui changerait, sans rien toucher
#   terraform apply     → applique (avec confirmation)
# L'état (terraform.tfstate) n'est JAMAIS dans Git : il est dans un bucket GCS privé, versionné et verrouillé
# pendant un apply (deux personnes ne peuvent pas modifier l'infra en même temps).
# Le bucket d'état est le seul élément créé hors Terraform (il doit exister avant le premier init) :
#   gcloud storage buckets create gs://pause-demo-3zbux5-tfstate --location=europe-west9 \
#     --uniform-bucket-level-access --public-access-prevention && \
#   gcloud storage buckets update gs://pause-demo-3zbux5-tfstate --versioning
terraform {
  required_version = ">= 1.7.0" # blocs import avec for_each

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }

  backend "gcs" {
    bucket = "pause-demo-3zbux5-tfstate"
    prefix = "pause"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
