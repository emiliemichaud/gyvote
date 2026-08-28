# Gyvote - Application de vote en direct

Gyvote est une application web légère permettant d'organiser des votes en direct lors d’assemblées ou de conférence des maitres. L'animateur Cree une session, partage un code ou un QR code, et les participants votent en temps reel depuis leur smartphone.

## Fonctionnalites principales

* Creation de sessions de vote éphémères.
* Votes anonymes et uniques (un seul vote par participant par session).
* Suivi du nombre de participants connectes en direct (compteur de presence).
* Affichage du dépouillement en direct reserve a l'animateur.
* Interface adapted aux mobiles pour les votants.
* Nettoyage automatique et sécurise des sessions et des votes apres 15 heures.

## Architecture technique

Le projet a ete migre vers un écosystème 100% Cloudflare (sans serveur dédie) pour des performances optimales et des coûts réduits :

* **Backend / API :** Cloudflare Workers (script `worker/index.js`). Le Worker gear les requêtes API, sert le frontend statique, et execute le nettoyage automatique via un Cron Trigger.
* **Base de donnees :** Cloudflare D1 (base relationnelle SQLite).
* **Frontend :** HTML, CSS et JavaScript "vanilla" (sans framework lourd). 

L'architecture ne necessities qu'un seul service (le Worker) pour exposer l'API REST et distribuer les fichiers web (HTML/JS/CSS).

## Structure du projet

Les fichiers sources de l'interface utilisateur sont places a la racine du projet pour faciliter l'edition.

* `worker/index.js` : Le code source de l'API et du backend.
* `schema.sql` : Le schema de la base de donnees D1.
* `index.html`, `host.html`, `vote.html`, `404.html` : Les pages principales.
* `app.js`, `api-config.js` : La logique frontend et la configuration.
* `style.css` : La feuille de style globale.
* `sync.sh` : Script de preparation pour construire le dossier `public/`.
* `wrangler.toml` : La configuration Cloudflare du projet.

## Developpement et Deploiement

Toutes les instructions pour configurer l'environnement de development local, gérer la base de donnees D1, et deployer l'application en production se trouvent dans le guide détaille :

**Voir le guide de deploiement : [DEPLOIEMENT.md](DEPLOIEMENT.md)**
