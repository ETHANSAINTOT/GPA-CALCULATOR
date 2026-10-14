# GPA Calculator

Calculateur de GPA en Node.js avec une base SQLite. Le serveur tourne sur http://localhost:5984.

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

Il faut Node.js 22.13 ou plus récent (SQLite est intégré à Node, rien d'autre à installer).

```bash
npm install
npm start
```

`npm start` lit le fichier `.env`. La base est créée dans `data/gpa.sqlite`. Variables optionnelles : `PORT`, `HOST`, `DB_PATH`.

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
