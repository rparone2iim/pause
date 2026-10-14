# Sécurité — Pause

Ce fichier contient trois choses :
1. la checklist des 10 piliers, avec pour chacun ce qu'on a fait et où le montrer dans le code ;
2. les questions que le jury risque de poser, avec les réponses ;
3. ce qu'on ajouterait pour la production sur AWS (le « nice-to-have »).

**Démo en direct :** `npm run security:test` lance 27 attaques contre l'API et vérifie que chacune est bloquée.

---

## 1. Les 10 piliers

| # | Pilier | Ce qu'on a fait | Où dans le code |
|---|---|---|---|
| 1 | **Authentification & autorisation** | JWT HS256 signé, valable 2 h, avec émetteur et audience vérifiés. L'algorithme est **forcé** au moment de la vérification (un token `alg: none` est rejeté). Le token est envoyé dans `Authorization: Bearer`. `requireUser()` protège toutes les routes privées et revérifie que l'utilisateur existe encore en base. **Anti-IDOR :** seul l'auteur peut modifier ou supprimer son spot (403 sinon), et l'`authorId` vient du token, jamais du body. | `src/lib/auth.ts`, `src/lib/spots.ts` (`assertOwner`) |
| 2 | **Endpoints sécurisés** | Rate limit global à 120 req/min/IP. Login limité à 10 essais/15 min par IP **et** 5 essais/15 min par compte visé. Inscription : 20/h/IP. Création de spot : 20/h. Upload : 30/h. **CORS strict :** front et API sont sur la même origine, on n'envoie aucun `Access-Control-Allow-Origin`, et toute requête API qui arrive avec un `Origin` étranger est refusée (403). | `src/lib/rateLimit.ts`, `src/middleware.ts` |
| 3 | **Chiffrement des données sensibles** | bcrypt avec un coût de 12 (salt intégré). Mot de passe de 10 caractères minimum, 72 octets maximum (limite de bcrypt : on refuse au lieu de tronquer en silence). HTTPS/TLS assuré par Caddy, et HSTS activé. | `src/lib/auth.ts`, `Caddyfile` |
| 4 | **Validation des entrées** | Un schéma Zod `.strict()` sur **chaque** entrée : un champ inconnu est rejeté, chaque champ a son type, ses bornes et sa longueur max. Le body JSON est limité à 16 Ko, et un mauvais Content-Type renvoie 415. Les caractères de contrôle sont nettoyés. **Upload :** le type est vérifié sur le contenu réel (et non sur l'extension), l'image est ré-encodée en WebP, les EXIF/GPS sont supprimés, le nom de fichier est un UUID (pas de path traversal) et les bombes de décompression sont bloquées. | `src/lib/validation.ts`, `src/lib/http.ts` (`readJson`), `src/lib/upload.ts` |
| 5 | **Dépendances à jour** | `npm audit` renvoie **0 vulnérabilité**. Versions figées (`-E`) + `package-lock.json`. Deux dépendances indirectes vulnérables sont forcées vers leur version corrigée via `overrides` dans `package.json`. | `package.json`, `npm run audit` |
| 6 | **Logs & zéro fuite technique** | Logs JSON structurés (pino) avec un `requestId` sur chaque requête. Mots de passe et tokens masqués automatiquement dans les logs, ainsi que les valeurs des requêtes SQL en cas d'erreur (sinon un email ou un hash finirait dans les logs). Le client ne reçoit **jamais** de stack trace ni d'erreur SQL, seulement `{ code, message, requestId }`. Le `requestId` permet de retrouver le détail dans les logs. | `src/lib/http.ts` (`route`), `src/lib/logger.ts`, `src/app/error.tsx` |
| 7 | **CSRF** | Le JWT est envoyé dans le header `Authorization`, pas dans un cookie. Le navigateur ne l'ajoute donc jamais tout seul : une requête forgée par un site tiers arrive sans token et prend un 401. | `src/lib/client.ts` |
| 8 | **Base de données** | Drizzle ORM génère des requêtes **toujours paramétrées** (`$1, $2…`), donc aucune concaténation SQL. **Deux utilisateurs Postgres :** `pause_migrator` (propriétaire, sert uniquement aux migrations) et `pause_app` (SELECT/INSERT/UPDATE/DELETE seulement : il ne peut ni faire de DROP ni d'ALTER). Des contraintes `CHECK` en base doublent la validation (notes entre 1 et 5, coordonnées valides). Les ids sont des UUID non devinables. | `src/lib/db.ts`, `db/init.sh`, `src/db/schema.ts` |
| 9 | **Durcissement serveur & infra** | Les en-têtes « façon Helmet » sont posés dans `next.config.ts` : HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, et `X-Powered-By` est masqué. **CSP avec nonce** générée à chaque requête (un script injecté n'a pas le nonce, donc il est bloqué). Côté Docker : image multi-stage, process lancé en utilisateur `node` (non-root), code en lecture seule, `read_only: true`, `no-new-privileges`. **Ni la base ni l'app n'exposent de port :** seul Caddy (80/443) est accessible. | `next.config.ts`, `src/middleware.ts`, `Dockerfile`, `docker-compose.yml` |
| IA | **Assistant Gemini** | Filtre hors sujet avant l'appel, quotas par utilisateur et global, clé côté serveur uniquement, entrées bornées (Zod), rate limit par utilisateur, aucune donnée personnelle envoyée, données utilisateurs balisées (anti prompt injection), références de spots vérifiées, réponse affichée en texte brut, mode local de secours. | `src/lib/assistant.ts`, `src/app/api/assistant/route.ts` |
| 10 | **Audit & tests d'intrusion** | Script de 27 tests d'attaque : sans token, JWT forgé, `alg: none`, IDOR, brute force, origine étrangère, champ en trop, mauvais type, JSON géant, faux fichier image, path traversal, JSON cassé, injection SQL, énumération d'emails, en-têtes. | `scripts/security-test.sh` |

---

## 2. Questions probables du jury

**« Le JWT dans le localStorage, c'est pas dangereux ? »**
C'est un compromis assumé. Un token envoyé en header est **immunisé contre le CSRF**. En contrepartie, il serait lisible en cas de **XSS**. On réduit ce risque XSS de trois façons :
- React échappe tout ce qu'il affiche, et on n'utilise jamais `dangerouslySetInnerHTML` ;
- la **CSP avec nonce** bloque tout script injecté ;
- le token expire au bout de 2 h.

L'alternative serait un cookie `HttpOnly` + `Secure` + `SameSite=Strict`. Il est illisible en JS, mais il faut alors gérer un token anti-CSRF. C'est dans notre « nice-to-have ».

**« Je change l'id dans l'URL, je supprime le spot de quelqu'un d'autre ? »**
Non. C'est la faille **IDOR**. Être connecté ne suffit pas : `assertOwner()` compare l'auteur du spot à l'utilisateur du token, et renvoie 403 sinon. C'est le test « IDOR » du script.

**« Pourquoi bcrypt et pas SHA-256 ? »**
SHA-256 est conçu pour être **rapide** : un GPU en calcule des milliards par seconde. bcrypt est **lent exprès** (coût 12, environ 250 ms) et intègre un sel unique par mot de passe, donc pas de rainbow tables possibles.

**« Comment vous empêchez de deviner quels emails sont inscrits ? »**
Le login renvoie le même message dans les deux cas (« Email ou mot de passe incorrect »). Et quand l'email n'existe pas, on fait **quand même** un `bcrypt.compare` contre un faux hash, pour que le temps de réponse soit identique. *Limite connue :* l'inscription répond « email déjà utilisé ». On l'assume pour l'ergonomie, et c'est limité par le rate limit.

**« Votre rate limit en mémoire, il marche avec plusieurs serveurs ? »**
Non, il est valable pour une instance (la démo). En prod multi-instances, on le passe dans Redis, ou dans AWS WAF / API Gateway.

**« Et si quelqu'un change son IP dans X-Forwarded-For ? »**
On ne fait confiance à ce header que si `TRUST_PROXY=true`, c'est-à-dire derrière Caddy (ou le load balancer AWS) qui **écrase** la valeur par la vraie IP. On prend alors la dernière valeur, celle écrite par le proxy. Sans proxy, on ignore le header.

**« Une image peut contenir un virus ? »**
On ne fait pas confiance au fichier :
- `sharp` lit les vrais octets pour déterminer le format (seuls JPEG, PNG et WebP passent) ;
- on **ré-encode** l'image, ce qui détruit tout contenu caché ;
- on limite la taille (5 Mo) et le nombre de pixels (anti bombe de décompression) ;
- le nom de fichier est un UUID généré par nous.

**Bonus RGPD :** les EXIF sont supprimés, et ils contiennent souvent la **position GPS** de la personne qui a pris la photo.

**« Vous stockez la position des utilisateurs ? »**
Non. La position sert uniquement à calculer les distances et n'est jamais enregistrée (minimisation RGPD). On ne stocke que la position des **spots**.

**« Les photos sont publiques ? »**
Oui, par URL, parce qu'une balise `<img>` ne peut pas envoyer de header `Authorization`. Mais le nom est un UUID aléatoire (impossible à deviner ou à énumérer), et l'image a été nettoyée.

**« Pourquoi pas Helmet ? »**
Helmet est un middleware Express. Avec Next.js, on pose les **mêmes en-têtes** dans `next.config.ts`, et la CSP dans `middleware.ts` (parce qu'elle contient un nonce différent à chaque requête).

**« Comment vous protégez contre l'injection SQL ? »**
L'ORM (Drizzle) envoie toujours la requête et les valeurs **séparément** (requête préparée). La valeur n'est jamais interprétée comme du SQL. En plus, l'utilisateur Postgres de l'app n'a pas le droit de faire de DROP ni d'ALTER : même dans le pire cas, les dégâts sont limités.

**« Que se passe-t-il si une erreur plante le serveur ? »**
Le wrapper `route()` intercepte tout : le détail part dans les logs avec un `requestId`, et le client reçoit `500 « Une erreur interne est survenue »` + le `requestId`.

**« Votre chatbot, on peut le pirater avec du prompt injection ? »**
On l'a conçu en partant du principe que oui, quelqu'un essaiera :
- l'IA n'a **aucun pouvoir** : pas d'outil, pas d'accès à la base, pas d'action possible. Au pire, elle écrit une mauvaise phrase ;
- les descriptions de spots (écrites par les utilisateurs) lui sont données comme des **données balisées**, avec la consigne explicite de ne pas suivre d'instructions dedans ;
- elle ne peut recommander que des spots de la liste : les références qu'elle renvoie sont **vérifiées côté serveur**, une référence inventée est jetée ;
- sa réponse est affichée en **texte brut** (React échappe tout), donc même si elle renvoyait du `<script>`, rien ne s'exécute (testé).

**« Et vos données personnelles, elles partent chez l'IA ? »**
Non. Gemini reçoit seulement la question, les 10 derniers messages et la liste des spots proches (nom, distance en minutes, note). Jamais l'email, l'id ou les **coordonnées GPS** de l'utilisateur. Les messages ne sont pas stockés et pas écrits dans les logs.

**« Et la clé d'API ? Et si quelqu'un spamme le chatbot avec n'importe quoi ? »**
La clé Gemini est dans une variable d'environnement côté serveur, envoyée à Google dans un header (jamais dans l'URL), jamais au navigateur. Pour protéger le quota, on empile 4 barrières :
1. **Filtre hors sujet AVANT Gemini** : une question sans rapport avec les pauses (« capitale du Pérou », « fais mes devoirs ») reçoit une réponse toute faite, sans aucun appel à Gemini. Idem pour « salut / merci ».
2. **Anti-insistance** : 6 questions hors sujet en 10 min → bloqué 10 min (429).
3. **Quotas** : 20 messages / 10 min par utilisateur, 30 appels Gemini / jour par utilisateur, 500 / jour pour toute l'app. Au-delà → réponses automatiques, l'app continue de marcher.
4. **Tailles bornées** : message ≤ 500 caractères, historique ≤ 10 messages, réponse ≤ 800 tokens, timeout 15 s.
Et si une question hors sujet passe quand même le filtre, la consigne système demande à Gemini de refuser en une phrase.

**« Si l'IA tombe en panne pendant la démo ? »**
L'assistant bascule automatiquement sur un mode local (règles simples + fiches de conseils écrites par nous). L'app ne plante jamais à cause de l'IA.

---

## 3. Nice-to-have (production AWS)

| Pilier | En prod on ajouterait |
|---|---|
| 1 | Refresh tokens + révocation, MFA pour les comptes admin, rôles (modérateur) |
| 2 | AWS WAF + rate limit Redis (ElastiCache) partagé entre instances |
| 3 | RDS chiffré (KMS), certificats via ACM sur l'ALB |
| 4 | Modération des photos / textes, antivirus sur les uploads |
| 5 | Dependabot + `npm audit` dans la CI (GitHub Actions) qui bloque les PR |
| 6 | Logs vers CloudWatch, alertes sur les pics de 401/429/500 |
| 7 | Cookie `HttpOnly; Secure; SameSite=Strict` + token anti-CSRF |
| 8 | Snapshots RDS automatiques, restauration testée |
| 9 | Security Groups (seul l'ALB parle à l'app, seule l'app parle à RDS), sous-réseaux privés |
| 10 | SAST (Semgrep) en CI, pentest externe |

**Architecture AWS cible :** Route 53 → ALB (HTTPS via ACM) → ECS Fargate (l'image Docker de l'app) → RDS PostgreSQL en sous-réseau privé. Photos dans S3 (bucket privé, servies via CloudFront). Secrets dans AWS Secrets Manager.
