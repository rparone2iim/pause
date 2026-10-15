# ─────────────────────────────────────────────────────────────
# Pilier 9 : image multi-étapes, exécutée en utilisateur NON-ROOT.
# ─────────────────────────────────────────────────────────────

# 1) Dépendances (installées exactement selon le package-lock.json)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build Next.js (sortie "standalone" = uniquement les fichiers nécessaires)
FROM deps AS build
COPY . .
RUN npm run build

# 3) Image "migrator" : applique les migrations + données de démo, puis s'arrête
FROM deps AS migrator
COPY . .
USER node
CMD ["sh", "-c", "npx tsx db/migrate.ts && npx tsx db/seed.ts"]

# 4) Image finale, minimale
FROM node:22-slim AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# L'app n'a besoin que de "node" : npm, npx et corepack (et leurs failles) ne partent pas en production.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*  # correctifs de sécurité Debian
# Le code appartient à root et est en lecture seule pour l'utilisateur "node" :
# même si l'app était compromise, elle ne pourrait pas modifier son propre code.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Seul dossier inscriptible : les photos uploadées
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "server.js"]
