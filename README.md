# GPA Calculator

Calculateur de GPA en Node.js avec une base libSQL (SQLite). En local et avec Docker, il tourne sur http://localhost:5984 ; il est aussi hébergeable sur Vercel.

## Clé de chiffrement

Les données sensibles sont chiffrées avec une clé à fournir dans un fichier `.env` (ignoré par git) :

```bash
cp .env.example .env
```

Puis mets une clé générée par `npm run -s key` (ou `openssl rand -base64 32`) dans `ENCRYPTION_KEY`.

**Sauvegarde cette clé.** Sans elle, la base est illisible ; avec une autre clé, le serveur refuse de démarrer.

## Lancer avec Docker

```bash
docker compose up -d --build
```

L'app écoute sur http://localhost:5984 (uniquement en local). La base est dans le volume Docker `gpa-data` et survit aux redémarrages.

```bash
docker compose logs -f     # logs
docker compose down        # arrêter (les données restent)
docker compose down -v     # arrêter ET supprimer les données
```

## Lancer sans Docker

Il faut Node.js 22.

```bash
npm install
npm start
```

`npm start` lit le fichier `.env`. La base est un fichier créé dans `data/gpa.sqlite`.

## Héberger sur Vercel

Sur Vercel, le disque n'est pas persistant : la base doit être distante. Le code utilise libSQL, donc une base [Turso](https://turso.tech) convient sans changement (intégration disponible dans la marketplace Vercel).

Variables d'environnement à définir dans le projet Vercel :

| Variable | Valeur |
| --- | --- |
| `ENCRYPTION_KEY` | Clé générée par `npm run -s key` (la même que celle qui a chiffré la base) |
| `DATABASE_URL` | URL de la base, ex. `libsql://gpa-calculator-xxx.turso.io` |
| `DATABASE_AUTH_TOKEN` | Jeton d'accès à la base |

`TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN`, créées par l'intégration Turso de Vercel, sont aussi reconnues.

Le reste est dans `vercel.json` : les fichiers de `public/` sont servis par le CDN, tout le reste passe par la fonction `api/index.js` (l'app Express). Les tables sont créées automatiquement à la première requête.

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ENCRYPTION_KEY` | (obligatoire) | Clé de chiffrement des données |
| `DATABASE_URL` | fichier `data/gpa.sqlite` | Base libSQL : `file:…`, `libsql://…` ou `http(s)://…` |
| `DATABASE_AUTH_TOKEN` | aucun | Jeton pour une base distante |
| `PORT` / `HOST` | `5984` / `localhost` | Écoute du serveur (hors Vercel) |

## Pages

| Route | Rôle |
| --- | --- |
| `/` | Accueil : créer un compte ou se connecter |
| `/account-creation` | Création du compte (prénom, nom, mail, mot de passe, crédits et GPA actuels) |
| `/account-creation-success` | Confirmation de création |
| `/connection` | Connexion |
| `/calculator` | Calculateur (connexion requise) |

## Calcul

| Grade | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| Points | 4 | 3 | 2 | 1 | 0 |

```
nouveau GPA = (GPA actuel × crédits actuels + Σ points × crédits de l'UE) / (crédits actuels + Σ crédits des UE)
```

Une UE de 4 crédits notée C compte comme quatre C. Une UE notée E compte dans le GPA (0 point sur ses crédits) mais ses crédits ne sont pas acquis.

## Sécurité des données

| Donnée | Protection |
| --- | --- |
| Prénom, nom, adresse mail | Chiffrés (AES-256-GCM) |
| GPA et crédits de départ, UE (nom, crédits, grade) | Chiffrés (AES-256-GCM) |
| Adresse mail (recherche à la connexion) | Empreinte HMAC-SHA256, sans casse |
| Mot de passe | Haché avec scrypt (irréversible) |
| Jeton de session | Seule son empreinte SHA-256 est stockée |

Chaque valeur chiffrée a son propre IV aléatoire et un tag d'authentification : une valeur modifiée dans la base est rejetée. Les clés de chiffrement et d'empreinte sont dérivées de `ENCRYPTION_KEY` par HKDF.

## Tests

```bash
npm test
```
