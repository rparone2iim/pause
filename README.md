# ⏸ Pause

Web app qui affiche sur une carte les meilleurs spots de pause autour de toi : coin fumeur, café, banc calme ou abri.
Tu crées un compte, tu te connectes, et tu vois les spots dans un rayon de 300 m à 3 km, triés du plus proche au plus loin.
Chaque spot a des photos, des tags, une description, un « comment y aller » et des avis. Tout le monde peut ajouter un spot.

Sécurité : voir **[SECURITY.md](SECURITY.md)** (10 piliers + réponses au jury). `npm run security:test` lance 74 attaques réelles (et `npm run security:test:alain` 27 de plus), toutes bloquées. `npm test` lance les tests unitaires et de composants (Vitest).

**En ligne : https://pause-572691549135.europe-west9.run.app** (Google Cloud Run, déployé automatiquement à chaque merge sur `main`).

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
npm run db:seed             # données de démo (autour de l'école et à La Défense)
npm run dev                 # http://localhost:3000
```

**« Demander à l'IA » (Gemini) :** sans configuration, le dialogue répond avec son repli local (mots-clés + conseils de détente). En prod, il utilise Gemini via **Vertex AI, sans aucune clé**. Pour avoir les vraies réponses Gemini en dev, il faut un accès au projet Google Cloud. Mets `VERTEX_PROJECT=pause-demo-3zbux5` dans `.env`, puis lance avec `VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run dev` (le jeton dure 1 h). Autre solution : une clé AI Studio dans `GEMINI_API_KEY`. Le modèle par défaut est `gemini-3.5-flash-lite`.

**Comptes de démo :** `demo@pause.dev` et `alex@pause.dev`, mot de passe `DemoPause2026`.

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (règles d'auth, schémas, erreurs, IA avec un faux Gemini…) et de composants (formulaires dans un faux navigateur) : aucun serveur ni base nécessaire |
| `npm run test:integration` | Les vraies routes de l'API contre une vraie base migrée (`DATABASE_URL`) |
| `npm run security:test` | Les 74 attaques contre l'API (l'app doit tourner). Contre le site en ligne : `BASE_URL=https://pause-572691549135.europe-west9.run.app APP_ORIGIN=https://pause-572691549135.europe-west9.run.app npm run security:test` |
| `npm run security:test:alain` | Les tests d'attaque historiques d'alain (`scripts/security-test.sh`), adaptés à `/api/v1` |
| `npm run audit` | Audit des dépendances de production |
| `npm run lint` | ESLint (aussi lancé par `npm run build`) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:generate` | Génère une migration SQL après une modification de `src/db/schema.ts` (écrire aussi son inverse dans `db/migrations/down/`, sinon les tests échouent) |
| `npm run db:rollback` | Annule la dernière migration (`-- 2` : les deux dernières, `-- --all` : tout, base vide) |

### En ligne (Google Cloud)

**https://pause-572691549135.europe-west9.run.app**, sur Google Cloud à Paris (projet `pause-demo-3zbux5`, région `europe-west9`). **Toute cette infra est décrite en Terraform dans `terraform/`** (rien n'est créé à la main) :

| Brique | Service Google Cloud |
|---|---|
| App Next.js (image `runner` du `Dockerfile`, non-root) | **Cloud Run** `pause` (HTTPS fourni par Google) |
| Migrations + seed (image `migrator`) | **Cloud Run job** `pause-migrate`, lancé par la CD avant chaque déploiement |
| PostgreSQL 16 (rôles `pause_migrator` / `pause_app`) | **Cloud SQL** `pause-db`, sans réseau autorisé : accès seulement par le connecteur Cloud SQL (IAM) |
| Photos | **Cloud Storage**, bucket privé monté dans le conteneur sur `/app/uploads` |
| Secrets (URL de la base, `JWT_SECRET`) | **Secret Manager**, aucun secret dans l'image ni dans GitHub |

- **Mettre à jour le site :** il suffit de **pousser sur `main`**. La CI/CD décrite plus bas teste puis déploie toute seule.
- **IA :** Gemini via Vertex AI, **sans clé API**. Le service tourne avec le compte `pause-app` (Vertex AI, base, photos et ses 2 secrets, rien d'autre). L'app demande un jeton temporaire au metadata server de Google Cloud. Droits : `terraform/iam.tf`.
- **Vraie IP client :** Cloud Run *ajoute* l'IP du client à la fin de `X-Forwarded-For` (ce qui est avant peut être inventé) → avec `TRUST_PROXY=true`, l'app lit la **dernière** valeur.
- **Version en ligne :** `gcloud run services describe pause --region europe-west9 --format 'value(spec.template.spec.containers[0].image)'` (tag = hash du commit).
- **Logs :** `gcloud run services logs read pause --region europe-west9 --limit 50`
- **Tout supprimer après la soutenance :** `gcloud projects delete pause-demo-3zbux5`

### CI/CD (GitHub Actions)

Le fichier est `.github/workflows/ci-cd.yml`.

| Quand | Job | Ce qu'il fait |
|---|---|---|
| Chaque push et PR | **Tests** | `npm ci`, `npm audit`, ESLint, contrat OpenAPI (Spectral + routes codées = routes documentées), build, `typecheck`, **tests unitaires et de composants** (Vitest), Postgres jetable (2 rôles, migrations **montées → toutes annulées → remontées**), **tests d'intégration**, seed, démarrage de l'app, **27 + 74 tests d'attaque** |
| Chaque push et PR | **SAST** | Semgrep (règles par défaut, TypeScript, Next.js, Terraform) : bloque sur le moindre résultat, et une PR ne peut pas être mergée sans lui |
| Chaque push et PR | **Terraform** | `terraform fmt -check` + `validate` (image officielle, version figée) |
| Chaque push et PR | **Docker** | `docker-compose.yml` valide, build des images app + migrator, l'app tourne en non-root, **scan Trivy** de l'image (bloque sur une faille critique corrigeable) |
| Push sur `main`, si tout est vert | **Déploiement** | Connexion à Google Cloud **sans clé** (Workload Identity Federation), images poussées dans Artifact Registry, migrations sur Cloud SQL (job Cloud Run), nouvelle version sur Cloud Run, puis vérification HTTPS, API protégée et HSTS |

- **Aucun secret dans GitHub.** GitHub prouve son identité à Google avec un jeton OIDC signé. Seul le dépôt `rparone2iim/pause` sur la branche `main` peut emprunter le compte de service `github-deploy`, qui n'a que les droits pour pousser les images et déployer sur Cloud Run.
- **Infrastructure as Code (`terraform/`) :** Cloud Run (service + job), Cloud SQL, bucket des photos, Secret Manager (les boîtes, pas leur contenu), Artifact Registry, comptes de service, Workload Identity Federation. `terraform plan` montre l'écart entre le code et la prod (aucun aujourd'hui). La prod existait avant : `imports.tf` la fait adopter au premier `apply`, sans rien recréer. L'état est dans un bucket GCS privé (commande de création en tête de `versions.tf`), jamais dans Git. La CD ne change que l'image ; tout le reste vient de Terraform.
- **Dependabot** (`.github/dependabot.yml`) ouvre chaque semaine des PR de mise à jour (npm, actions, images Docker), avec 7 jours de délai après chaque publication (anti paquet piégé). La CI les teste avant tout merge.
- **Actions GitHub figées sur un commit (SHA)**, pas sur un tag qu'un pirate pourrait déplacer.
- **`main` est protégée :** pas de push direct (même pour l'admin), PR obligatoire, CI verte (Tests, Docker, Semgrep, Terraform) et branche à jour obligatoires, pas de force-push. Une branche par fonctionnalité → PR → CI verte → merge, ce qui déploie automatiquement.

---

## La stack

| Brique | Outil |
|---|---|
| Front + API | Next.js 15 (React 19, TypeScript) — les `route.ts` de `src/app/api/v1/` deviennent des URLs d'API (toutes versionnées en `/api/v1/…`) |
| Base de données | PostgreSQL 16 (Docker) / 17 (Homebrew) |
| Accès à la base | Drizzle ORM (requêtes paramétrées) |
| Validation | Zod |
| Authentification | jose (JWT HS256, access token 15 min) + refresh token rotatif en cookie HttpOnly + bcryptjs (coût 12) |
| Photos | sharp (vérifie, redimensionne, convertit en WebP, efface les métadonnées) |
| Logs | pino (JSON, secrets masqués) |
| IA | Gemini (Flash-Lite, API REST) via **Vertex AI sans clé** en production, avec filtre hors sujet, quotas et repli local |
| Carte | Leaflet + react-leaflet + tuiles OpenStreetMap |
| Design | Tailwind CSS v4 + shadcn/ui, icônes Lucide |
| Déploiement | Google Cloud Run + Cloud SQL + Cloud Storage, CI/CD GitHub Actions |

Toutes les versions sont figées dans `package.json`.

## L'organisation du code

```
db/
├─ init.sh              ← crée la base et les rôles pause_migrator / pause_app
├─ migrations/          ← SQL généré par drizzle-kit (+ down/ : l'inverse de chaque migration)
├─ migrate.ts  rollback.ts ← appliquer / annuler les migrations (rôle pause_migrator)
└─ seed.ts              ← données de démo
src/
├─ app/                 ← Next.js : 1 dossier = 1 URL
│  ├─ api/              ← l'API (chaque route.ts = 1-3 lignes qui appellent un controller)
│  ├─ page.tsx          ← Explorer (carte + liste)
│  ├─ spots/[id]/       ← fiche spot (+ edit/ pour l'auteur)
│  ├─ spots/new/        ← ajouter un spot
│  ├─ profile/  (auth)/login/  (auth)/register/
│  └─ layout.tsx  globals.css
├─ components/          ← morceaux d'interface (maps.tsx + maps.impl.tsx, PlaceCard, SpotForm…, Providers.tsx)
├─ hooks/               ← état partagé du front, un hook par sujet : useAuth, usePlaces, useTheme, useUi, useRequireAuth
├─ db/schema.ts         ← les tables (users, spots, photos, reviews, favorites + sessions)
├─ lib/                 ← le cœur : sécurité + outils
│  ├─ controllers/      ← HTTP : auth, lecture/validation de la requête, status, headers
│  ├─ services/         ← logique métier : règles d'accès, un avis par personne, 6 photos max… (erreurs MÉTIER, jamais HTTP)
│  ├─ repositories/     ← accès à la base (Drizzle) — seule couche qui touche `db`
│  ├─ schemas.ts        ← schémas Zod des corps de requête, PARTAGÉS par l'API et les formulaires du front
│  ├─ domain-errors.ts  ← erreurs métier (NotFound, Forbidden…) ; errors.ts les traduit en statut HTTP, en un seul endroit
│  ├─ auth.ts  http.ts  validation.ts  rateLimit.ts  upload.ts  spots.ts  google-auth.ts
│  ├─ db.ts  env.ts  logger.ts  errors.ts  geo.ts  constants.ts  types.ts
│  ├─ client.ts         ← côté navigateur : api() ajoute l'access token (en mémoire) et le renouvelle via le cookie
│  ├─ osm.ts  google-places.ts ← lieux (Google Places + OpenStreetMap), Nominatim, Open-Meteo
│  ├─ assistant.ts  nearby.ts ← « Demander à l'IA » (Gemini via Vertex AI sans clé, filtre hors sujet, repli local)
│  └─ api-routes.ts     ← table des routes (405 + Allow)
└─ middleware.ts        ← avant CHAQUE requête : Origin, JWT, 405, CSP avec nonce
tests/                       ← unit/ (règles), components/ (formulaires, jsdom), integration/ (vraies routes + vraie base)
scripts/security-test.mjs    ← les 74 attaques     scripts/security-test.sh ← les 27 d'origine
openapi.yaml                 ← contrat de l'API (OpenAPI 3.1), hors de public/ : pas publié par le site
scripts/contract-check.mjs   ← routes codées = routes du contrat OpenAPI     .spectral.yaml ← règles du contrat
terraform/                   ← toute l'infra Google Cloud en Terraform
.github/workflows/ci-cd.yml  ← CI/CD     Dockerfile  docker-compose.yml  Caddyfile  SECURITY.md
```

Une requête API : `middleware.ts` (Origin, JWT, 405) → `route()` (requestId, traceparent, rate limit) → controller (`requireUser()` = JWT + session active, `readJson()` + Zod)
→ service (`assertOwner()`, règles, erreurs métier) → repository (Drizzle → PostgreSQL avec `pause_app`) → réponse JSON (ou Problem Details, l'erreur métier traduite par `toHttpError()`) + une ligne de log.

## Les routes de l'API

Toutes les routes sont sous **`/api/v1/`**. Toutes demandent d'être connecté, sauf l'inscription, la connexion, l'affichage d'une photo ou d'une image, et `/api/v1/health`.
Le navigateur n'appelle **que notre API** (plus les tuiles de la carte) : les images des lieux OpenStreetMap sont re-servies par `/api/v1/images`.
Le design suit la cheatsheet REST : noms au pluriel, kebab-case, champs en lowerCamelCase, **erreurs en Problem Details** (`application/problem+json` : `{ type, title, status, detail, instance, code, requestId, fields? }`), collections bornées `{ data, page: { limit, nextCursor } }`, `Location` sur les 201, `WWW-Authenticate` sur les 401, `Retry-After` sur les 429, `Allow` sur les 405, `ETag` / `If-None-Match` (304) / `If-Match` (412) sur les spots, JSON Merge Patch pour les `PATCH`, `traceparent` sur chaque réponse. Contrat complet : **`openapi.yaml`** (OpenAPI 3.1, vérifié en CI, pas publié par le site).

| Méthode | URL | Ce qu'elle fait |
|---|---|---|
| POST | `/api/v1/users` | Crée un compte et sa première session (20/h par IP) |
| POST | `/api/v1/sessions` | Connexion : access token (15 min) dans la réponse + refresh token en cookie HttpOnly (10 échecs / 15 min par IP, 5 par compte) |
| POST | `/api/v1/sessions/current/tokens` | Nouvel access token grâce au cookie, qui est remplacé à chaque fois (rotation) |
| DELETE | `/api/v1/sessions/current` | Déconnexion de **cet** appareil (ses deux jetons meurent tout de suite) |
| GET / PATCH / DELETE | `/api/v1/me` | Mon profil + favoris + mes spots / modifier pseudo, types, rayon / supprimer mon compte |
| GET | `/api/v1/spots?lat=&lng=&radius=&type=` | Spots dans le rayon, du plus proche au plus loin |
| POST | `/api/v1/spots` | Crée un spot (20/h) |
| GET / PATCH / DELETE | `/api/v1/spots/:id` | Fiche complète (ETag) / modifier (JSON Merge Patch, If-Match) / supprimer (**l'auteur uniquement**) |
| GET / PUT | `/api/v1/spots/:id/reviews` | Plus d'avis / créer ou mettre à jour **mon** avis (30/h) |
| POST | `/api/v1/spots/:id/photos` | Ajouter une photo (multipart, champ `photo`, 6 max par spot, 30/h) |
| PUT / DELETE | `/api/v1/spots/:id/favorite` | Ajouter / retirer des favoris |
| GET / DELETE | `/api/v1/photos/:name` | L'image (publique) / la supprimer (son auteur ou celui du spot) |
| GET | `/api/v1/images?u=&s=` | Image d'un lieu OpenStreetMap (Wikimedia), re-servie par notre API : URL signée par le serveur, vérifiée et ré-encodée |
| GET | `/api/v1/addresses?query=&scope=global\|near`, `/api/v1/weather` | Recherche d'adresse (partout ou près de moi), météo |
| POST | `/api/v1/assistant/messages` | Un message à l'assistant : sa réponse + les spots qu'il recommande (20 / 10 min, quotas Gemini par jour) |
| GET | `/api/v1/health` | État du service (sans détail interne, jamais en cache) |

## Ce qu'on a en plus du cahier des charges

- **Vrais lieux autour de toi** en plus des spots de la communauté : cafés, bars et parcs de **Google Maps** (API Places, appelée **sans clé** depuis Cloud Run, horaires à jour), plus les bancs, cendriers et abris d'**OpenStreetMap** quand ses serveurs répondent. On peut les noter, les photographier et les mettre en favori. Si aucune source ne répond, la carte affiche quand même les spots de la communauté.
- **Météo** (Open-Meteo), **recherche d'adresse** (Nominatim), **horaires** et « ouvert maintenant ».
- **Spots privés** (visibles seulement par leur auteur).
- **Access token court + refresh token rotatif** (cookie HttpOnly, SameSite=Strict) avec **détection de vol** : un refresh token rejoué coupe toute la session. **Vraie déconnexion** côté serveur (un seul appareil), **suppression de compte** (RGPD) avec ses photos.
- Architecture **controllers / services / repositories**.
- `Idempotency-Key` (pas de doublon si on clique deux fois), pagination des avis, `/api/v1/health`, contrat OpenAPI, mode sombre.
- **« Demander à l'IA »** (Gemini via Vertex AI, sans clé) : une vraie conversation qui te guide vers un spot et donne des **conseils de détente** (respiration, étirements, yoga de bureau). Les spots qu'elle connaît sont lus **côté serveur** dans notre base (jamais envoyés par le navigateur), **jamais ta position**, et elle ne peut recommander que ces spots (vérifié). Les questions hors sujet sont filtrées **avant** d'appeler Gemini, des quotas par jour protègent le budget, et un mode local prend le relais si l'IA ne répond pas.
- **Accessibilité** : 0 erreur à l'audit axe-core (WCAG 2 A/AA) sur toutes les pages, en clair et en sombre : champs étiquetés, contrastes AA, cartes cliquables au clavier, titres hiérarchisés, erreurs annoncées.
- **Descriptions et photos dans la liste** à gauche de la carte.
- **Mise en ligne sur Google Cloud Run** et **CI/CD** : à chaque PR, lint, tests unitaires / composants / intégration, contrat OpenAPI, 101 attaques, Semgrep, Trivy, Terraform ; déploiement automatique au merge sur `main`, sans aucune clé stockée.

---

## Répartition à 3 (soutenance vendredi)

| Qui | Périmètre | Piliers à maîtriser par cœur |
|---|---|---|
| **Personne 1 : API & sécu** | `src/lib/*`, `src/app/api/*`, `SECURITY.md` | 1 Auth · 2 Rate limit/CORS · 4 Validation · 6 Logs/erreurs · 7 CSRF |
| **Personne 2 : Front** | pages, `components/`, design (coller à la maquette) | XSS/CSP (9), upload côté UX, pourquoi le token est en header (7) |
| **Personne 3 : Infra & données** | Docker, Caddy, Postgres, seed avec de **vrais spots + vraies photos** près de l'école, Google Cloud et CI/CD (`terraform/`, `.github/`) | 3 HTTPS/bcrypt · 5 Dépendances · 8 BDD · 9 Docker non-root · 10 Tests |

⚠️ Le jury peut interroger **n'importe qui sur n'importe quoi** : tout le monde lit `SECURITY.md` en entier.

### Planning

- **Mardi :** chacun lance le projet chez soi et lit son périmètre et `SECURITY.md`.
- **Mercredi :** ajustements (design, vrais spots, photos), commits réguliers.
- **Jeudi midi :** gel des fonctionnalités. Ensuite `npm run audit`, `npm run security:test`, répétition de la démo et des questions.
- **Vendredi :** soutenance. Démo conseillée : connexion → carte → fiche → ajout d'un spot avec photo → `npm run security:test` en direct.
