# Déploiement de gyvote sur Cloudflare

Ce document décrit comment configurer, développer en local et déployer l'application gyvote sur Cloudflare (Workers + D1). Il est destiné à toute personne reprenant le projet.

---

## Architecture

```
Cloudflare Worker (worker/index.js)
  - Sert les fichiers statiques depuis public/
  - Expose une API REST sous /api/*
  - Exécute un nettoyage automatique toutes les 15 minutes (Cron)

Cloudflare D1 (base de données SQLite)
  - Table sessions : code, statut, secret animateur
  - Table votes    : choix par participant et par session
```

Le Worker et le frontend sont déployés ensemble avec une seule commande. Il n'y a pas de serveur séparé.

---

## Structure du projet

```
worker/
  index.js              API REST + Cron (code backend)
public/
  index.html            Page d'accueil (créer / rejoindre une session)
  host.html             Interface de l'animateur
  vote.html             Bulletin de vote
  404.html              Page de vote via lien court (/CODE)
  confidentialite.html
  style.css
  app.js                Fonctions partagées (fetch vers l'API)
  api-config.js         URL de base de l'API (vide = même origine)
  vendor/
    qrcode.min.js
index.html              Source (toujours éditer ici, pas dans public/)
host.html               Source
vote.html               Source
404.html                Source
app.js                  Source
api-config.js           Source
style.css               Source
schema.sql              Schéma de la base D1
wrangler.toml           Configuration Cloudflare
sync.sh                 Copie les sources vers public/
```

> Les fichiers sources (HTML, CSS, JS) se trouvent à la racine et sont copiés dans `public/` par `sync.sh` avant chaque commit. Toujours éditer les fichiers sources à la racine, pas ceux de `public/`.

---

## Prérequis

- Node.js >= 18 (vérifier avec `node --version`)
- Un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up
- Un compte GitHub avec accès au dépôt

---

## Installation de Wrangler

Wrangler est l'outil en ligne de commande de Cloudflare pour gérer les Workers et D1.

```bash
npm install -g --allow-scripts=esbuild,workerd wrangler
wrangler --version
```

---

## Première mise en place

### 1. Connexion à Cloudflare

```bash
wrangler login
```

Un navigateur s'ouvre. Se connecter avec son compte Cloudflare et cliquer sur "Allow".

### 2. Créer la base de données D1

```bash
wrangler d1 create gyvote-db --location weur
```

`weur` correspond à Western Europe (Amsterdam), le datacenter Cloudflare le plus proche de la Suisse.

La commande affiche un bloc de configuration similaire à :

```
[[d1_databases]]
binding = "DB"
database_name = "gyvote-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copier le `database_id` et le remplacer dans `wrangler.toml` :

```toml
[[d1_databases]]
binding = "DB"
database_name = "gyvote-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. Créer les tables en production

```bash
wrangler d1 execute gyvote-db --remote --file=schema.sql
```

### 4. Créer les tables en local (pour le développement)

```bash
wrangler d1 execute gyvote-db --local --file=schema.sql
```

---

## Développement en local

### Lancer le serveur local

```bash
pkill -f "wrangler dev" 2>/dev/null   # fermer toute instance précédente
wrangler dev --local
```

Ouvrir ensuite http://localhost:8787 dans le navigateur.

Le Worker et le frontend sont servis depuis le même port. Il n'y a pas de second serveur à lancer.

### Modifier les fichiers HTML, CSS ou JS

Editer les fichiers sources à la racine (`index.html`, `host.html`, `app.js`, etc.).

Après chaque modification, synchroniser vers `public/` :

```bash
./sync.sh
```

Wrangler détecte le changement et recharge automatiquement.

### Modifier le code du Worker

Editer `worker/index.js`. Wrangler recharge automatiquement.

### Tester le Cron de nettoyage

```bash
curl "http://localhost:8787/cdn-cgi/local/scheduled"
```

---

## Déploiement manuel en production

```bash
./sync.sh
wrangler deploy
```

L'URL du Worker est affichée à la fin :

```
Deployed gyvote to https://gyvote.SOUS-DOMAINE.workers.dev
```

C'est l'URL publique de l'application.

---

## Déploiement automatique — Connexion Git depuis le dashboard Cloudflare

Chaque `git push` sur la branche `main` déclenche automatiquement un déploiement en production. La connexion se configure directement dans le dashboard Cloudflare, sans token ni fichier de configuration supplémentaire.

### Configuration (à faire une seule fois)

**Etape 1 — Ouvrir le Worker dans le dashboard**

Se rendre sur https://dash.cloudflare.com, puis :

Workers & Pages > gyvote > Settings > Build & Deployments

**Etape 2 — Connecter le dépôt GitHub**

Cliquer sur "Connect repository" et sélectionner le dépôt GitHub du projet. Cloudflare demande l'autorisation d'accès à GitHub lors de la première connexion.

**Etape 3 — Configurer le build**

Renseigner les champs suivants :

```
Build command   : bash sync.sh
Deploy command  : wrangler deploy
```

Le champ "Build command" indique à Cloudflare d'exécuter le script de synchronisation avant chaque déploiement. Cloudflare va créer le dossier `public/` à la volée, ce qui évite de devoir le versionner sur Git.

Sauvegarder.

### Workflow quotidien

Tu n'as plus besoin de te soucier du dossier `public/`. Modifie tes fichiers sources à la racine, puis pousse directement sur Git :

```bash
git add -A
git commit -m "Description des modifications"
git push origin main
```

Cloudflare détecte le push, exécute `sync.sh` pour préparer les assets, et lance le déploiement automatiquement.

*(Note : En développement local, tu dois toujours lancer `./sync.sh` pour que `wrangler dev` prenne en compte tes dernières modifications).*

---

## Fichiers à ne pas committer

Le fichier `.gitignore` à la racine exclut déjà :

```
.wrangler/          Etat local de D1, généré automatiquement
api-config.local.js Dev local uniquement
api-config.prod.js  Fichier de backup temporaire
supabase-config.js  Ancien système, ne plus utiliser
.DS_Store
node_modules/
```

### Si supabase-config.js est déjà dans l'historique git

Ce fichier contient des clés d'accès Supabase. Le retirer de git :

```bash
git rm --cached supabase-config.js
git commit -m "Remove Supabase credentials from tracking"
git push
```

---

## Commandes de référence

| Action | Commande |
|---|---|
| Lancer le dev local | `wrangler dev --local` |
| Sync sources vers public/ | `./sync.sh` |
| Déployer en production | `./sync.sh && wrangler deploy` |
| Créer la DB D1 | `wrangler d1 create gyvote-db --location weur` |
| Appliquer le schéma (local) | `wrangler d1 execute gyvote-db --local --file=schema.sql` |
| Appliquer le schéma (prod) | `wrangler d1 execute gyvote-db --remote --file=schema.sql` |
| Lire les sessions en prod | `wrangler d1 execute gyvote-db --remote --command="SELECT * FROM sessions"` |
| Voir les logs du Worker | `wrangler tail` |
| Tester le Cron en local | `curl http://localhost:8787/cdn-cgi/local/scheduled` |

---

## Résolution de problèmes courants

**Le Worker démarre sur le port 8788 au lieu de 8787**

Un processus Wrangler tourne déjà en arrière-plan. Le fermer :

```bash
pkill -f "wrangler dev"
```

Puis relancer `wrangler dev --local`.

**"Route introuvable" en JSON quand on accède à un code**

Le Worker n'a pas accès au binding ASSETS. Vérifier que `wrangler.toml` contient bien :

```toml
[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "404-page"
```

**Le serveur recharge en boucle**

Le dossier assets surveille trop de fichiers. Vérifier que `[assets] directory` pointe sur `"./public"` et non `"."`.

**Erreur "database_id" lors du déploiement**

Remplacer `REMPLACER_PAR_VOTRE_DATABASE_ID` dans `wrangler.toml` par l'ID réel obtenu avec `wrangler d1 create`.

**Les modifications ne s'affichent pas après un push**

Le fichier `public/` n'a probablement pas été synchronisé avant le commit. Relancer :

```bash
./sync.sh
git add public/
git commit -m "Sync public/"
git push
```
