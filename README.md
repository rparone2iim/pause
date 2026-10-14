# ⏸ Pause

Pause trouve autour de toi les meilleurs spots de pause : coin fumeur, café, banc calme ou abri. Chaque spot a des photos, des notes et un « comment y aller ».

**Stack :** Next.js 15 (front + API) · PostgreSQL · Drizzle ORM · Zod · JWT (jose) · bcrypt · Leaflet/OpenStreetMap · Docker + Caddy

---

## Lancer le projet

### Option A : Docker (le plus simple, tout est inclus)

```bash
cp .env.example .env        # puis remplacer les mots de passe et le JWT_SECRET
docker compose up --build
```

Ouvrir **https://localhost** et accepter l'avertissement (le certificat est auto-signé en local).

### Option B : en dev (rechargement à chaud)

Il faut un PostgreSQL local (par exemple `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).

```bash
npm install
cp .env.example .env
# créer les 2 utilisateurs Postgres + la base (une seule fois) :
PGHOST=localhost PGPASSWORD=postgres POSTGRES_USER=postgres \
  MIGRATOR_DB_PASSWORD=change-moi-aussi APP_DB_PASSWORD=change-moi-encore sh db/init.sh
set -a && . ./.env && set +a
npm run db:migrate          # crée les tables
npm run db:seed             # données de démo (La Défense)
npm run dev                 # http://localhost:3000
```

**Assistant IA (Gemini) :** sans configuration, il donne des réponses automatiques (mode local). En prod, il utilise Gemini via **Vertex AI, sans aucune clé**. Pour avoir les vraies réponses Gemini en dev, il faut un accès au projet Google Cloud. Mets `VERTEX_PROJECT=pause-demo-3zbux5` dans `.env`, puis lance avec `VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run dev` (le jeton dure 1 h). Autre solution : une clé AI Studio dans `GEMINI_API_KEY`. Le modèle par défaut est `gemini-3.5-flash-lite`.

**Comptes de démo :** `demo@pause.dev` et `alex@pause.dev`, mot de passe `DemoPause2026`.

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run security:test` | 27 tests d'attaque contre l'API (l'app doit tourner). En Docker : `BASE_URL=https://localhost INSECURE=1 npm run security:test` |
| `npm run audit` | Audit des dépendances |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:generate` | Génère une migration SQL après une modification de `src/db/schema.ts` |

### En ligne (Google Cloud)

**https://34-155-60-223.sslip.io**. C'est une VM Compute Engine `t2d-standard-1` (1 vCPU AMD, 4 Go) à Paris (projet `pause-demo-3zbux5`) qui fait tourner le même `docker-compose.yml`. Le certificat HTTPS est fourni par Let's Encrypt via Caddy. Le pare-feu n'ouvre que 80/443 au public, et SSH n'est accessible que depuis une IP autorisée ou via le tunnel IAP.

- **Mettre à jour le site :** il suffit de **pousser sur `main`**. La CI/CD décrite plus bas teste puis déploie toute seule. En secours seulement : `bash scripts/deploy-gcp.sh` (il faut `gcloud` connecté au compte du projet). Le `.env` de prod (secrets aléatoires) reste sur la VM, et la base et les photos sont conservées.
- **IA :** Gemini via Vertex AI, **sans clé API**. La VM tourne avec le compte de service `pause-app`, qui n'a qu'un seul droit : `roles/aiplatform.user`. L'app demande un jeton temporaire au metadata server de Google Cloud. La mise en place est dans `infra/gcp/setup-vertex.sh`.
- **Version en ligne :** `cat /opt/pause/.revision` sur la VM (hash du commit déployé).
- **Logs :** `gcloud compute ssh pause-vm --zone europe-west9-b --project pause-demo-3zbux5 --command 'cd /opt/pause && sudo docker compose logs --tail 50 app'`
- **Tout supprimer après la soutenance :** `gcloud projects delete pause-demo-3zbux5`

### CI/CD (GitHub Actions)

Le fichier est `.github/workflows/ci-cd.yml`.

| Quand | Job | Ce qu'il fait |
|---|---|---|
| Chaque push et PR | **Tests** | `npm ci`, `npm audit`, build, `typecheck`, Postgres jetable (2 rôles, migrations, seed), démarrage de l'app, **27 tests de sécurité** |
| Chaque push et PR | **Docker** | `docker-compose.yml` valide, build des images app + migrator, vérification que l'app tourne en non-root |
| Push sur `main`, si tout est vert | **Déploiement** | Connexion à Google Cloud **sans clé** (Workload Identity Federation), envoi du code par tunnel IAP, `scripts/remote-deploy.sh` sur la VM, puis vérification HTTPS, API protégée et HSTS |

- **Aucun secret dans GitHub.** GitHub prouve son identité à Google avec un jeton OIDC signé. Seul le dépôt `rparone2iim/pause` sur la branche `main` peut emprunter le compte de service `github-deploy`, qui n'a que les droits pour se connecter à la VM.
- **Mise en place de Google Cloud :** `infra/gcp/setup-cicd.sh`, à lancer une seule fois. Il crée le compte de service, Workload Identity Federation et OS Login. Le script de premier démarrage de la VM est `infra/gcp/startup.sh`.
- **Dependabot** (`.github/dependabot.yml`) ouvre chaque semaine des PR de mise à jour (npm, actions, images Docker). La CI les teste avant tout merge.
- **Workflow conseillé :** une branche par fonctionnalité, puis une PR. La CI doit être verte, puis on merge sur `main`, ce qui déploie automatiquement.

---

## Structure

```
src/
  app/
    api/                 ← L'API (Route Handlers Next.js)
      auth/login|register
      me/                  profil + favoris
      spots/               liste par rayon, création
      spots/[id]/          fiche, modif, suppression (auteur seulement)
      spots/[id]/reviews   mon avis (créer / mettre à jour)
      spots/[id]/photos    upload
      spots/[id]/favorite  ajouter / retirer
      photos/[name]        servir / supprimer une photo
      assistant/           chatbot : recommandations + conseils détente
    page.tsx             ← Carte + liste
    spots/[id]/          ← Fiche spot
    spots/new/           ← Ajouter un spot
    profile/             ← Profil, préférences, favoris
    login/ register/
  lib/                   ← TOUTE la sécurité est ici
    auth.ts              JWT + bcrypt + requireUser
    http.ts              wrapper route() : erreurs, logs, rate limit global, lecture JSON
    validation.ts        schémas Zod
    rateLimit.ts         rate limiting
    upload.ts            traitement sécurisé des photos
    spots.ts             contrôle « est-ce bien ton spot ? » (IDOR)
    nearby.ts            recherche des spots dans un rayon (carte + assistant)
    assistant.ts         assistant IA (Gemini) + filtre hors sujet + mode local de secours
  middleware.ts          CSP avec nonce + blocage des origines étrangères
  db/schema.ts           les 5 tables
db/                      migrations SQL, init des rôles Postgres, seed
scripts/security-test.sh tests d'attaque
SECURITY.md              ← les 10 piliers + réponses aux questions du jury
```

**Flux d'une requête API :** `middleware.ts` (vérifie l'origine) → `route()` (rate limit, requestId) → `requireUser()` (vérifie le JWT) → `readJson(schema)` (Zod) → Drizzle (requête paramétrée) → réponse. En cas d'erreur, `route()` renvoie un message générique et logue le détail.

---

## Répartition à 3 (soutenance vendredi)

| Qui | Périmètre | Piliers à maîtriser par cœur |
|---|---|---|
| **Personne 1 : API & sécu** | `src/lib/*`, `src/app/api/*`, `SECURITY.md` | 1 Auth · 2 Rate limit/CORS · 4 Validation · 6 Logs/erreurs · 7 CSRF |
| **Personne 2 : Front** | pages, `components/`, design (coller à la maquette) | XSS/CSP (9), upload côté UX, pourquoi le token est en header (7) |
| **Personne 3 : Infra & données** | Docker, Caddy, Postgres, seed avec de **vrais spots + vraies photos** près de l'école, préparation AWS | 3 HTTPS/bcrypt · 5 Dépendances · 8 BDD · 9 Docker non-root · 10 Tests |

⚠️ Le jury peut interroger **n'importe qui sur n'importe quoi** : tout le monde lit `SECURITY.md` en entier.

### Planning

- **Mardi :** chacun lance le projet chez soi et lit son périmètre et `SECURITY.md`.
- **Mercredi :** ajustements (design, vrais spots, photos), commits réguliers.
- **Jeudi midi :** gel des fonctionnalités. Ensuite `npm run audit`, `npm run security:test`, répétition de la démo et des questions.
- **Vendredi :** soutenance. Démo conseillée : connexion → carte → fiche → ajout d'un spot avec photo → `npm run security:test` en direct.
