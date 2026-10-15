# Les deux valeurs à mettre dans GitHub (Settings → Secrets and variables → Actions → Variables).
output "GCP_WIF_PROVIDER" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "GCP_DEPLOY_SA" {
  value = google_service_account.deployer.email
}

output "site_url" {
  value = google_cloud_run_v2_service.app.uri
}
