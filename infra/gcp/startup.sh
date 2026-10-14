#!/bin/bash
# Exécuté au 1er démarrage : swap + Docker + mises à jour de sécurité automatiques
set -e
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
if ! command -v docker >/dev/null; then
  apt-get update -y
  apt-get install -y ca-certificates curl unattended-upgrades
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
mkdir -p /opt/pause
touch /var/run/pause-ready
