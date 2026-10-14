#!/bin/sh
# Pilier 8 : deux utilisateurs Postgres distincts.
#  - pause_migrator : propriétaire du schéma, utilisé UNIQUEMENT pour les migrations.
#  - pause_app      : utilisé par l'application, droits SELECT/INSERT/UPDATE/DELETE seulement
#                     (pas de DROP, pas d'ALTER, pas de CREATE, pas superuser).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE pause_migrator LOGIN CREATEDB PASSWORD '${MIGRATOR_DB_PASSWORD}'; -- CREATEDB: base "shadow" de prisma migrate dev
CREATE ROLE pause_app      LOGIN PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE pause OWNER pause_migrator;
REVOKE ALL ON DATABASE pause FROM PUBLIC;
GRANT CONNECT ON DATABASE pause TO pause_app;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname pause <<SQL
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pause_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pause_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pause_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pause_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pause_app;
SQL
