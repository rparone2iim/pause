# ⏸ Pause

**Team:** Aldric Vendas, Alain Sliman and Raphaël Parone

A web app that shows the best break spots around you on a map: smoking corner, café, quiet bench or shelter.
You create an account, log in, and see the spots within a radius of 300 m to 3 km, sorted from nearest to farthest.
Each spot has photos, tags, a description, a "how to get there" section and reviews. Anyone can add a spot.

Security: `npm run security:test` runs 74 real attacks (and `npm run security:test:alain` 27 more), all blocked. `npm test` runs the unit and component tests (Vitest).

**Live: https://pause-572691549135.europe-west9.run.app** (Google Cloud Run, deployed automatically on every merge to `main`).

---

## Running the project

### Option A: Docker (simplest, everything included)

```bash
cp .env.example .env        # then replace the passwords and JWT_SECRET
docker compose up --build
```

Open **https://localhost** and accept the warning (the certificate is self-signed locally).

### Option B: dev mode (hot reload)

You need a local PostgreSQL (for example `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).

```bash
npm install
cp .env.example .env
# create the 2 Postgres users + the database (once):
PGHOST=localhost PGPASSWORD=postgres POSTGRES_USER=postgres \
  MIGRATOR_DB_PASSWORD=change-moi-aussi APP_DB_PASSWORD=change-moi-encore sh db/init.sh
set -a && . ./.env && set +a
npm run db:migrate          # creates the tables
npm run db:seed             # demo data (around the school and in La Défense)
npm run dev                 # http://localhost:3000
```

`npm run dev` and `npm run build` first copy the MapLibre worker from `node_modules` to `public/maplibre/` (ignored by Git): the map loads it from our own site.

**API documentation (Swagger UI):** in dev, **http://localhost:3000/docs** shows `openapi.yaml` interactively. In production, `/docs` returns 404: the site does not publish a map of its API.

**"Demander à l'IA" (Ask the AI, Gemini):** with no configuration, the dialog answers with its local fallback (keywords + relaxation tips). In production it uses Gemini through **Vertex AI, with no key at all**. To get real Gemini answers in dev, you need access to the Google Cloud project. Set `VERTEX_PROJECT=pause-demo-3zbux5` in `.env`, then run `VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run dev` (the token lasts 1 h). Alternative: an AI Studio key in `GEMINI_API_KEY`. The default model is `gemini-3.5-flash-lite`.

**Demo accounts:** `demo@pause.dev` and `alex@pause.dev`, password `DemoPause2026`.

### Useful commands

| Command | Purpose |
|---|---|
| `npm test` | Unit tests (auth rules, schemas, errors, AI with a fake Gemini…) and component tests (forms in a fake browser): no server or database needed |
| `npm run test:watch` | Vitest in watch mode (reruns the tests on every change) |
| `npm run test:integration` | The real API routes against a real migrated database (`DATABASE_URL`) |
| `npm run security:test` | The 74 attacks against the API (the app must be running). Against the live site: `BASE_URL=https://pause-572691549135.europe-west9.run.app APP_ORIGIN=https://pause-572691549135.europe-west9.run.app npm run security:test` |
| `npm run security:test:alain` | alain's original attack tests (`scripts/security-test.sh`), adapted to `/api/v1` |
| `npm run audit` | Audit of the production dependencies |
| `npm run lint` | ESLint (also run by `npm run build`) |
| `npm run typecheck` | TypeScript check |
| `npm run contract:lint` | Validates `openapi.yaml` with Spectral (rules in `.spectral.yaml`) |
| `npm run contract:check` | Checks that the coded routes are exactly the routes of the OpenAPI contract |
| `npm run db:generate` | Generates an SQL migration after a change to `src/db/schema.ts` (also write its inverse in `db/migrations/down/`, otherwise the tests fail) |
| `npm run db:rollback` | Reverts the last migration (`-- 2`: the last two, `-- --all`: everything, empty database) |

### Live (Google Cloud)

**https://pause-572691549135.europe-west9.run.app**, on Google Cloud in Paris (project `pause-demo-3zbux5`, region `europe-west9`). **All of this infrastructure is described in Terraform in `terraform/`** (nothing is created by hand):

| Component | Google Cloud service |
|---|---|
| Next.js app (`runner` image of the `Dockerfile`, non-root) | **Cloud Run** `pause` (HTTPS provided by Google) |
| Migrations + seed (`migrator` image) | **Cloud Run job** `pause-migrate`, run by the CD before every deployment |
| PostgreSQL 16 (roles `pause_migrator` / `pause_app`) | **Cloud SQL** `pause-db`, no authorized network: access only through the Cloud SQL connector (IAM) |
| Photos | **Cloud Storage**, private bucket mounted in the container at `/app/uploads` |
| Secrets (database URL, `JWT_SECRET`) | **Secret Manager**, no secret in the image or in GitHub |
| Docker images | **Artifact Registry** |
| AI | **Vertex AI** (Gemini) |

- **Updating the site:** just **merge a PR into `main`**. The CI/CD described below tests and then deploys on its own.
- **AI:** Gemini through Vertex AI, **no API key**. The service runs as the `pause-app` account (Vertex AI, database, photos and its 2 secrets, nothing else). The app asks Google Cloud's metadata server for a short-lived token. Permissions: `terraform/iam.tf`.
- **Real client IP:** Cloud Run *appends* the client IP to the end of `X-Forwarded-For` (whatever comes before can be forged) → with `TRUST_PROXY=true`, the app reads the **last** value.
- **Live version:** `gcloud run services describe pause --region europe-west9 --format 'value(spec.template.spec.containers[0].image)'` (tag = commit hash).
- **Logs:** `gcloud run services logs read pause --region europe-west9 --limit 50`
- **Delete everything after the defense:** `gcloud projects delete pause-demo-3zbux5`

### CI/CD (GitHub Actions)

The workflow is `.github/workflows/ci-cd.yml`.

| When | Job | What it does |
|---|---|---|
| Every push and PR | **Tests** | `npm ci`, `npm audit`, ESLint, OpenAPI contract (Spectral + coded routes = documented routes), build, `typecheck`, **unit and component tests** (Vitest), throwaway Postgres (2 roles, migrations **applied → all reverted → reapplied**), **integration tests**, seed, app startup, **27 + 74 attack tests** |
| Every push and PR | **SAST** | Semgrep (default, TypeScript and Next.js rule sets): fails on any finding, and a PR cannot be merged without it |
| Every push and PR | **Terraform** | `terraform fmt -check` + `validate` (official image, pinned version) |
| Every push and PR | **Docker** | valid `docker-compose.yml`, build of the app + migrator images, the app runs as non-root, **Trivy scan** of the image (fails on a fixable high or critical vulnerability) |
| Push to `main`, if everything is green | **Deployment** | **Keyless** login to Google Cloud (Workload Identity Federation), images pushed to Artifact Registry, migrations on Cloud SQL (Cloud Run job), new revision on Cloud Run, then checks of HTTPS, the protected API and HSTS |

- **No secret in GitHub.** GitHub proves its identity to Google with a signed OIDC token. Only the `rparone2iim/pause` repository on the `main` branch can impersonate the `github-deploy` service account, which only has the rights to push images and deploy to Cloud Run.
- **Infrastructure as Code (`terraform/`):** Cloud Run (service + job), Cloud SQL, photo bucket, Secret Manager (the secret containers, not their values), Artifact Registry, service accounts, Workload Identity Federation. `terraform plan` shows the drift between the code and production (none today). Production existed before: `imports.tf` adopts it on the first `apply`, without recreating anything. The state lives in a private GCS bucket (creation command at the top of `versions.tf`), never in Git. The CD only changes the image; everything else comes from Terraform.
- **Dependabot** (`.github/dependabot.yml`) opens update PRs every week (npm, actions, Docker images), with a 7-day cooldown after each release (protection against a compromised package). The CI tests them before any merge.
- **GitHub Actions pinned to a commit (SHA)**, not to a tag an attacker could move.
- **`main` is protected:** no direct push (not even for the admin), PR required, green CI (Tests, Docker, Semgrep, Terraform) and up-to-date branch required, no force-push. One branch per feature → PR → green CI → merge, which deploys automatically.

---

## The stack

| Area | Tool |
|---|---|
| Front end + API | **Next.js 15** (App Router, `standalone` output) with **React 19** and **TypeScript 5**, on **Node.js 22**. The `route.ts` files in `src/app/api/v1/` become API URLs (all versioned under `/api/v1/…`) |
| Database | **PostgreSQL 16** (Docker locally, Cloud SQL in production), driver `pg` |
| Database access | **Drizzle ORM** (parameterized queries) + **drizzle-kit** (SQL migrations, each with its hand-written `down`) |
| Validation | **Zod 4**, the same schemas on the server and in the front-end forms |
| Authentication | **jose** (JWT HS256, 15-minute access token) + rotating refresh token in an HttpOnly cookie + **bcryptjs** (cost 12) |
| Photos | **sharp** (checks, resizes, converts to WebP, strips metadata) |
| Logs | **pino** (JSON, secrets redacted) |
| AI | **Gemini** (Flash-Lite, REST API) through **Vertex AI with no key** in production (AI Studio key possible in dev), with an off-topic filter, daily quotas and a local fallback |
| Map | **OpenFreeMap** vector basemap (OpenStreetMap data, free, **no key, no account**), drawn by **MapLibre GL** inside **Leaflet** (`@maplibre/maplibre-gl-leaflet`); light `positron` or dark `dark` style depending on the theme. Markers, radius circle and tooltips: Leaflet + **react-leaflet** |
| Places and data | **Google Places API** (cafés, bars, parks, opening hours; called with no key from Cloud Run), **OpenStreetMap** through **Overpass** (benches, ashtrays, shelters), **opening_hours** (parses OSM opening hours), **Nominatim** (address search), **Open-Meteo** (weather), **Wikimedia Commons** (place pictures, re-served by our API) |
| Design | **Tailwind CSS v4** + **shadcn/ui** (**Radix UI** primitives, class-variance-authority, tw-animate-css), **sonner** (toasts), **Lucide** icons |
| Tests | **Vitest** + **Testing Library** + **jsdom** (unit, component and integration tests), `scripts/security-test.mjs` / `.sh` (attacks against a running server) |
| Code quality | **ESLint** (`eslint-config-next`), **TypeScript** (`tsc --noEmit`), **Semgrep** (SAST), **Spectral** (OpenAPI lint) |
| API contract | **OpenAPI 3.1** (`openapi.yaml`), **Swagger UI** (`swagger-ui-react`) on `/docs` in dev only |
| Containers | **Docker** (multi-stage `Dockerfile`: `runner` and `migrator` images, non-root), **Docker Compose** (Postgres + migrations + app + proxy), **Caddy** (local HTTPS reverse proxy), **Trivy** (image scan) |
| Deployment | **Google Cloud** (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry, Vertex AI), **Terraform**, **GitHub Actions**, **Dependabot** |

All versions are pinned in `package.json` (and the Docker images / actions in their files).

## Code layout

```
db/
├─ init.sh              ← creates the database and the pause_migrator / pause_app roles
├─ migrations/          ← SQL generated by drizzle-kit (+ down/: the inverse of each migration)
├─ migrate.ts  rollback.ts ← apply / revert the migrations (pause_migrator role)
└─ seed.ts              ← demo data
src/
├─ app/                 ← Next.js: 1 folder = 1 URL
│  ├─ api/              ← the API (each route.ts = 1-3 lines calling a controller; api/[...path]: JSON 404 for everything else)
│  ├─ page.tsx          ← Explore (map + list)
│  ├─ spots/[id]/       ← spot page (+ edit/ for its author)
│  ├─ spots/new/        ← add a spot
│  ├─ profile/  (auth)/login/  (auth)/register/
│  ├─ docs/             ← Swagger UI for openapi.yaml, dev only (404 in production)
│  └─ layout.tsx  template.tsx  error.tsx  not-found.tsx  globals.css
├─ components/          ← UI pieces (maps.tsx + maps.impl.tsx = the OpenFreeMap map, PlaceCard, SpotForm, AskAI…, ui/ = shadcn)
├─ hooks/               ← shared front-end state, one hook per topic: useAuth, usePlaces, useTheme, useUi, useRequireAuth
├─ db/schema.ts         ← the tables (users, spots, photos, reviews, favorites + sessions)
├─ lib/                 ← the core: security + tools
│  ├─ controllers/      ← HTTP: auth, reading/validating the request, status, headers
│  ├─ services/         ← business logic: access rules, one review per person, 6 photos max… (BUSINESS errors, never HTTP)
│  ├─ repositories/     ← database access (Drizzle) — the only layer that touches `db`
│  ├─ schemas.ts        ← Zod schemas of the request bodies, SHARED by the API and the front-end forms
│  ├─ domain-errors.ts  ← business errors (NotFound, Forbidden…); errors.ts maps them to HTTP status codes, in one place
│  ├─ auth.ts  auth-redirect.ts  http.ts  validation.ts  rateLimit.ts  upload.ts  spots.ts  google-auth.ts
│  ├─ db.ts  env.ts  logger.ts  errors.ts  geo.ts  pagination.ts  constants.ts  types.ts  icons.tsx  utils.ts
│  ├─ image-proxy.ts    ← Wikimedia pictures re-served by /api/v1/images (HMAC-signed URL, re-encoded)
│  ├─ client.ts         ← browser side: api() adds the access token (kept in memory) and renews it through the cookie
│  ├─ osm.ts  google-places.ts ← places (Google Places + OpenStreetMap), Nominatim, Open-Meteo
│  ├─ assistant.ts  nearby.ts ← "Ask the AI" (Gemini through Vertex AI with no key, off-topic filter, local fallback)
│  └─ api-routes.ts     ← route table (405 + Allow)
└─ middleware.ts        ← before EVERY request: Origin, JWT, 405, CSP with nonce
tests/                       ← unit/ (rules), components/ (forms, jsdom), integration/ (real routes + real database)
scripts/security-test.mjs    ← the 74 attacks     scripts/security-test.sh ← the original 27
openapi.yaml                 ← API contract (OpenAPI 3.1), outside public/: not served as a static file
scripts/contract-check.mjs   ← coded routes = routes of the OpenAPI contract     .spectral.yaml ← contract rules
scripts/copy-maplibre-worker.mjs ← copies the map worker to public/maplibre/ (before dev and build)
terraform/                   ← the whole Google Cloud infrastructure in Terraform
.github/workflows/ci-cd.yml  ← CI/CD     Dockerfile  docker-compose.yml  Caddyfile
```

An API request: `middleware.ts` (Origin, JWT, 405) → `route()` (requestId, traceparent, rate limit) → controller (`requireUser()` = JWT + active session, `readJson()` + Zod)
→ service (`assertOwner()`, rules, business errors) → repository (Drizzle → PostgreSQL as `pause_app`) → JSON response (or Problem Details, the business error mapped by `toHttpError()`) + one log line.

## API routes

All routes live under **`/api/v1/`**. All of them require being logged in, except sign-up, login, fetching a photo or an image, and `/api/v1/health`.
The browser calls **only our API** (plus the map, on `tiles.openfreemap.org`, the only other domain allowed by the CSP): pictures of OpenStreetMap places are re-served by `/api/v1/images`.
The design follows the REST cheat sheet: plural nouns, kebab-case, lowerCamelCase fields, **errors as Problem Details** (`application/problem+json`: `{ type, title, status, detail, instance, code, requestId, fields? }`), bounded collections `{ data, page: { limit, nextCursor } }`, `Location` on 201s, `WWW-Authenticate` on 401s, `Retry-After` on 429s, `Allow` on 405s, `ETag` / `If-None-Match` (304) / `If-Match` (412) on spots, JSON Merge Patch for `PATCH`, `traceparent` on every response. Full contract: **`openapi.yaml`** (OpenAPI 3.1, checked in CI, not published in production), browsable in dev at **`/docs`** (Swagger UI).

| Method | URL | What it does |
|---|---|---|
| POST | `/api/v1/users` | Creates an account and its first session (20/h per IP) |
| POST | `/api/v1/sessions` | Login: access token (15 min) in the response + refresh token in an HttpOnly cookie (10 failures / 15 min per IP, 5 per account) |
| POST | `/api/v1/sessions/current/tokens` | New access token from the cookie, which is replaced every time (rotation) |
| DELETE | `/api/v1/sessions/current` | Logs out **this** device (both its tokens die immediately) |
| GET / PATCH / DELETE | `/api/v1/me` | My profile + favorites + my spots / change nickname, types, radius / delete my account |
| GET | `/api/v1/spots?lat=&lng=&radius=&type=` | Spots within the radius, nearest first |
| POST | `/api/v1/spots` | Creates a spot (20/h) |
| GET / PATCH / DELETE | `/api/v1/spots/:id` | Full spot (ETag) / edit (JSON Merge Patch, If-Match) / delete (**author only**) |
| GET / PUT | `/api/v1/spots/:id/reviews` | More reviews / create or update **my** review (30/h) |
| POST | `/api/v1/spots/:id/photos` | Adds a photo (multipart, field `photo`, 6 max per spot, 30/h) |
| PUT / DELETE | `/api/v1/spots/:id/favorite` | Adds to / removes from favorites |
| GET / DELETE | `/api/v1/photos/:name` | The image (public) / delete it (its uploader or the spot's author) |
| GET | `/api/v1/images?u=&s=` | Picture of an OpenStreetMap place (Wikimedia), re-served by our API: URL signed by the server, checked and re-encoded |
| GET | `/api/v1/addresses?query=&scope=global\|near`, `/api/v1/weather` | Address search (anywhere or near me), weather |
| POST | `/api/v1/assistant/messages` | A message to the assistant: its answer + the spots it recommends (20 / 10 min, daily Gemini quotas) |
| GET | `/api/v1/health` | Service status (no internal details, never cached) |

## Beyond the specifications

- **Real places around you** in addition to the community spots: cafés, bars and parks from **Google Maps** (Places API, called **with no key** from Cloud Run, up-to-date opening hours), plus benches, ashtrays and shelters from **OpenStreetMap** when its servers respond. They can be rated, photographed and added to favorites. If no source responds, the map still shows the community spots.
- **Weather** (Open-Meteo), **address search** (Nominatim), **opening hours** and "open now".
- **Private spots** (visible only to their author).
- **Short access token + rotating refresh token** (HttpOnly cookie, SameSite=Strict) with **theft detection**: a replayed refresh token kills the whole session. **Real server-side logout** (one device), **account deletion** (GDPR) along with its photos.
- **Controllers / services / repositories** architecture.
- `Idempotency-Key` (no duplicate on a double click), paginated reviews, `/api/v1/health`, OpenAPI contract with Swagger UI in dev, dark mode (the map has a real dark style, not an inverted image).
- **"Ask the AI"** (Gemini through Vertex AI, no key): a real conversation that guides you to a spot and gives **relaxation tips** (breathing, stretches, desk yoga). The spots it knows are read **server-side** from our database (never sent by the browser), **never your location**, and it can only recommend those spots (verified). Off-topic questions are filtered **before** calling Gemini, daily quotas protect the budget, and a local mode takes over if the AI does not respond.
- **Accessibility:** 0 errors in the axe-core audit (WCAG 2 A/AA) on every page, in light and dark mode: labeled fields, AA contrast, keyboard-clickable cards, hierarchical headings, announced errors.
- **Descriptions and photos in the list** next to the map.
- **Deployed on Google Cloud Run** with **CI/CD**: on every PR, lint, unit / component / integration tests, OpenAPI contract, 101 attacks, Semgrep, Trivy, Terraform; automatic deployment on merge to `main`, with no stored key.
