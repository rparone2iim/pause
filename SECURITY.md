# Sécurité — Pause

Auto-audit selon les **10 piliers** du cours (colonne « MUST-HAVE » du bootcamp, plus ce qu'on a pris dans
« NICE-TO-HAVE »). Chaque pilier correspond à du code précis, et deux scripts prouvent qu'il marche :
**`npm run security:test` (74 attaques réelles) et `npm run security:test:alain` (27), toutes bloquées**, plus les tests unitaires, de composants et d'intégration (`npm test`, Vitest).
La CI les rejoue à chaque pull request, avec Semgrep (analyse du code) et Trivy (failles de l'image Docker).

```bash
npm run dev                  # dans un terminal
npm run security:test        # dans un autre (puis security:test:alain après un redémarrage : le brute force épuise le quota de l'IP)
```

## Les 10 piliers dans le code

| # | Pilier | Must-have : ce qu'on a fait | Nice-to-have déjà en place | Où |
|---|---|---|---|---|
| 1 | **Authentification & autorisation** | **Access token JWT HS256 de 15 min** envoyé dans `Authorization: Bearer`, algorithme forcé (`alg: none` rejeté), `iss`/`aud`/`exp` vérifiés, contrôlé deux fois (middleware + `requireUser()` qui vérifie aussi que **sa session est toujours ouverte**). **Refresh token** opaque, dans un cookie `HttpOnly; SameSite=Strict`, **à usage unique** (rotation) ; un refresh token déjà utilisé qui revient = vol → toute la session est révoquée. **Anti-IDOR** : `assertOwner()` (403), un spot privé d'un autre répond 404. | Sessions par appareil (déconnexion d'un seul appareil), suppression de compte | `src/lib/auth.ts`, `src/lib/services/auth.service.ts`, `src/lib/spots.ts`, `src/middleware.ts` |
| 2 | **Endpoints sécurisés** | Rate limit **global 120 req/min/IP**, renforcé : connexion (10 échecs / 15 min par IP, **5 par compte**), inscription 20/h, refresh 30/min, spots 20/h, avis 30/h, photos 30/h, IA 20 / 10 min. 429 + `Retry-After`. **CORS** : seule l'origine du front est acceptée, toute requête avec un `Origin` étranger → 403. | 405 + `Allow`, `Idempotency-Key`, IP client lue correctement derrière Cloud Run | `src/lib/rateLimit.ts`, `src/lib/http.ts`, `src/middleware.ts` |
| 3 | **Chiffrement** | **HTTPS** partout (Cloud Run en prod, Caddy en Docker) + **HSTS**. Mots de passe hachés avec **bcrypt coût 12** (≥ 10 demandé), limités à 72 octets (au-delà bcrypt tronquerait en silence : on refuse). Refresh tokens stockés **hachés (SHA-256)**. | Base Cloud SQL chiffrée au repos par Google, connexions à la base **chiffrées obligatoires**, secrets dans **Secret Manager** | `src/lib/auth.ts`, `next.config.ts`, `terraform/database.tf`, `terraform/secrets.tf` |
| 4 | **Validation des entrées** | Schémas **Zod `.strict()`** (allowlist), **les mêmes côté front** (formulaires) et côté API : un champ en trop comme `"role": "admin"` → 400 + `fields`. Types, bornes et longueurs partout ; caractères de contrôle invisibles retirés. JSON ≤ **16 Ko** (413), Content-Type vérifié (415). **Photos vérifiées sur leur contenu réel** (sharp), 5 Mo, anti bombe de décompression, **ré-encodées** en WebP : métadonnées (GPS) effacées. | Contraintes `CHECK` en base (double barrière), React échappe tout (anti-XSS) | `src/lib/schemas.ts`, `src/lib/validation.ts`, `src/lib/http.ts`, `src/lib/upload.ts` |
| 5 | **Dépendances** | Versions **figées**, `npm audit` des dépendances de production en CI (**bloque dès une faille haute**) → 0 vulnérabilité. | **Dependabot** (avec 7 jours de délai anti-paquet piégé), **Trivy** sur l'image Docker en CI (bloque sur une faille critique corrigeable), actions GitHub **figées sur un SHA** | `package.json`, `.github/dependabot.yml`, `.github/workflows/ci-cd.yml` |
| 6 | **Logs & zéro fuite** | Logs JSON (**pino**), une ligne par requête (sans query string). Mots de passe, hash, tokens, cookies **masqués** ; les valeurs des requêtes SQL aussi. Le client ne voit **jamais** de stack trace ni d'erreur SQL : erreurs en **Problem Details** (RFC 9457) `{ type, title, status, detail, instance, requestId }`. Les services lèvent des **erreurs métier** (jamais HTTP), traduites en un seul endroit. | Logs centralisés dans **Cloud Logging**, corrélés par `requestId` **et `traceparent`** (W3C) | `src/lib/logger.ts`, `src/lib/http.ts`, `src/lib/errors.ts`, `src/lib/domain-errors.ts` |
| 7 | **CSRF** | L'access token voyage **uniquement dans l'en-tête `Authorization`** : un site pirate ne peut pas le faire envoyer. | Le seul cookie (refresh) est `HttpOnly` + `SameSite=Strict` + limité au chemin `/api/v1/sessions/current`, **et** l'API refuse tout `Origin` étranger (403) : double protection | `src/lib/client.ts`, `src/lib/auth.ts`, `src/middleware.ts` |
| 8 | **Base de données** | Requêtes **paramétrées** (Drizzle). Deux rôles Postgres : `pause_migrator` (propriétaire, migrations seulement) et `pause_app` (lire/écrire des lignes, **pas de DROP ni d'ALTER**). | Contraintes `CHECK` / `UNIQUE`, **sauvegardes Cloud SQL chaque nuit** (7 gardées), protection anti-suppression, base sans réseau autorisé (connecteur IAM uniquement) | `src/lib/db.ts`, `src/db/schema.ts`, `db/init.sh` |
| 9 | **Durcissement serveur** | En-têtes « façon Helmet » (Next.js n'utilise pas Express) : **CSP avec nonce** par requête, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, pas de `X-Powered-By`. Image Docker multi-étapes, **utilisateur non-root**. | Docker Compose : système de fichiers en lecture seule, `cap_drop: ALL`, `no-new-privileges`, **réseau interne isolé pour la base** ; Cloud Run : chaque service a son compte de service au moindre privilège | `src/middleware.ts`, `next.config.ts`, `Dockerfile`, `docker-compose.yml` |
| 10 | **Audit & tests** | **101 attaques automatiques** (74 + 27) + **tests unitaires, de composants et d'intégration** (Vitest : auth, rotation des refresh tokens, IDOR, ETag, IA avec un faux Gemini…) + migrations **montées / annulées / remontées**, le tout rejoué par la **CI sur chaque PR** : `main` est protégée, rien n'est déployé si un test casse. | **SAST Semgrep** en CI (0 résultat), contrat **OpenAPI 3.1** vérifié (Spectral + routes codées = routes documentées), audit d'accessibilité axe-core, **Terraform** vérifié (fmt + validate) | `tests/`, `scripts/security-test.mjs`, `scripts/security-test.sh`, `.github/workflows/ci-cd.yml` |
| IA | **« Demander à l'IA »** | Gemini via **Vertex AI, sans clé API** (identité du serveur, jeton d'1 h). Filtre hors sujet **avant** l'appel, quotas par jour, entrées bornées (Zod), spots lus **côté serveur**, aucune position envoyée à l'IA, **réponse en JSON imposé par un schéma puis revalidée par Zod**, spots recommandés vérifiés, réponse en texte brut, mode local si l'IA ne répond pas. | | `src/lib/assistant.ts`, `src/lib/controllers/assistant.controller.ts` |

## Les attaques des scripts

Injections SQL (corps, chemin, query) · XSS stocké · JWT forgés (`alg: none`, autre secret, payload modifié) ·
token invalide / absent / après déconnexion · **refresh token** : rotation, cookie forgé, appel depuis un autre site, **refresh token volé rejoué → session révoquée** ·
champs en trop (`role`, `authorId`) · JSON cassé, trop gros, mauvais Content-Type · latitude, note, rayon hors limites ·
**IDOR** (modifier / supprimer le spot d'un autre, supprimer la photo d'un autre) · spot privé d'un autre ·
fausse image (PHP renommé `.jpg`) · photo > 5 Mo, non multipart, 7e photo · métadonnées EXIF effacées · path traversal ·
proxy d'images : signature falsifiée, SSRF vers le serveur de métadonnées · Origin étranger · CSP sans nonce ·
**REST** : Problem Details, 405 + `Allow`, `ETag` / 304 / `If-Match` 412, collections `{ data, page }`, `traceparent` ·
brute force sur un compte · **X-Forwarded-For falsifié** · rate limit global · idempotence · suppression de compte (RGPD) ·
**IA** : sans token, faux prompt système, message trop long, faux rôle « system », hors sujet, spam hors sujet bloqué au 6e.

## Questions du jury — réponses courtes

**« Access token, refresh token : comment ça marche chez vous ? »**
À la connexion, on reçoit deux jetons. L'**access token** (JWT, 15 min) va dans l'en-tête `Authorization` de chaque appel ;
le front le garde **en mémoire seulement** (pas dans le localStorage). Le **refresh token** (aléatoire, 7 jours d'inactivité max, 30 jours au total)
est dans un **cookie `HttpOnly`** : JavaScript ne peut pas le lire, et il n'est envoyé qu'à `/api/v1/sessions/current/tokens`.
Quand l'access token expire, le front en redemande un : le serveur donne un nouvel access token **et un nouveau refresh token** (l'ancien ne marche plus).

**« Et si on vole un refresh token ? »**
Il est à usage unique. Si le voleur s'en sert après la victime (ou l'inverse), le serveur voit revenir un jeton **déjà remplacé** :
il **révoque toute la session** (le voleur et la victime sont déconnectés, la victime se reconnecte simplement). Seul l'empreinte SHA-256 est en base :
une fuite de la base ne donne aucun jeton utilisable. Testé par le script.

**« Un cookie, ce n'est pas du CSRF ? »**
Le cookie ne sert qu'à obtenir un nouvel access token, pas à agir : il est `SameSite=Strict` (jamais envoyé depuis un autre site),
limité à un seul chemin, et l'API refuse toute requête avec un `Origin` étranger. Toutes les **actions** demandent l'access token dans un en-tête,
qu'un site pirate ne peut pas ajouter.

**« Et le XSS ? »**
Un script injecté ne trouverait ni jeton dans le localStorage (il n'y en a pas) ni le refresh token (cookie `HttpOnly`).
Surtout, la **CSP avec nonce** empêche le script de s'exécuter : chaque page porte un code aléatoire, et le navigateur
n'exécute que les scripts qui l'ont. React échappe tout le texte affiché, y compris les réponses de l'IA.

**« Comment marche la déconnexion avec un JWT ? »**
Chaque access token porte l'identifiant de sa **session** (`sid`). Se déconnecter ferme la session en base : `requireUser()` refuse
alors tout de suite l'access token, et le refresh token ne marche plus. Les autres appareils (autres sessions) restent connectés.

**« C'est quoi un IDOR et comment vous l'évitez ? »**
Être connecté ne suffit pas. Si Bob change l'id dans l'URL pour supprimer le spot d'Alice, `assertOwner()` compare l'auteur du spot à Bob et répond **403**.
Les ids sont des UUID aléatoires, mais on ne compte pas là-dessus : on vérifie toujours.

**« Le piège de l'IP ? »**
`X-Forwarded-For` peut être inventé. On ne le lit que derrière un proxy de confiance (`TRUST_PROXY=true`), et on prend la **dernière** valeur :
Caddy l'écrase, Cloud Run **ajoute** la vraie IP à la fin. Tout ce qui est avant a pu être inventé. Le script le teste.

**« Votre API respecte REST ? »**
Oui, la cheatsheet du cours : noms au pluriel (`/users`, `/sessions`, `/spots`), pas de verbe dans les URL (se connecter = **créer une session**),
versions dans le chemin (`/api/v1`), codes HTTP standards (201 + `Location`, 204, 304, 401 + `WWW-Authenticate`, 405 + `Allow`, 412, 429 + `Retry-After`),
erreurs en **Problem Details**, collections bornées `{ data, page }`, `PATCH` en JSON Merge Patch, `ETag` / `If-Match` contre les modifications perdues.
Le contrat **OpenAPI 3.1** (`openapi.yaml`) est vérifié en CI : une route codée mais non documentée fait échouer le build. Il n'est **pas publié** par le site (pas de carte gratuite de l'API pour un attaquant), comme Swagger désactivé en production.

**« Une erreur serveur, qu'est-ce que voit le client ? »**
`{ "type": "/problems/internal-error", "title": "Erreur interne", "status": 500, "detail": "Une erreur est survenue, réessaie.", "requestId": "…" }`.
Le détail (stack trace) est uniquement dans Cloud Logging, retrouvable grâce au `requestId` et au `traceparent`.

**« Pourquoi deux utilisateurs Postgres ? »**
Moindre privilège : si l'app était compromise, l'attaquant aurait les droits de `pause_app`, qui ne peut ni supprimer ni modifier une table.

**« Votre IA, on peut la pirater avec du prompt injection ? »**
L'IA n'a **aucun pouvoir** : pas d'outil, pas d'accès à la base. Les descriptions de spots (écrites par des utilisateurs) lui sont données comme des
**données balisées**, avec la consigne de ne jamais suivre d'instruction dedans. Elle ne peut recommander que des spots de la liste (vérifié côté serveur),
et sa réponse est affichée en texte brut.

**« Où sont les clés d'API de Gemini et de Google Maps ? »**
Il n'y en a pas : Cloud Run a sa propre identité (compte de service `pause-app`) et obtient un **jeton temporaire d'1 h** auprès du serveur de métadonnées de Google, pour Gemini (Vertex AI) comme pour Google Places. Ces appels partent du serveur uniquement : le navigateur ne parle jamais à Google.

**« Comment le code arrive-t-il en production ? »**
Une branche → une PR → la CI (lint, tests, contrat, 101 attaques, Semgrep, Trivy, Terraform) doit être verte → merge sur `main` (protégée : pas de push direct) →
GitHub se connecte à Google Cloud **sans clé** (Workload Identity Federation), applique les migrations (job Cloud Run) et déploie sur Cloud Run.

**« Et l'infrastructure, elle a été créée comment ? »**
Elle est décrite en **Terraform** (`terraform/`) : Cloud Run, Cloud SQL, bucket, secrets, comptes de service, accès GitHub sans clé.
`terraform plan` compare le code à la prod et montre toute modification faite à la main. Les **valeurs** des secrets ne passent jamais
par Terraform (elles finiraient en clair dans son état) : il ne crée que les « boîtes » Secret Manager.

## Reste à faire pour une vraie production

- Rate limit partagé entre instances (Memorystore Redis / Cloud Armor) : l'actuel est en mémoire (Cloud Run limité à 1 instance pour ça).
- 2FA pour les comptes, rôles (modérateur).
- Alertes sur les pics de 401 / 429 / 500 (Cloud Monitoring).
- Pentest externe.
