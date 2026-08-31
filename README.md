# Gyvote - Application de Vote en Temps Réel

Gyvote est une application web légère de vote interactif et en temps réel, conçue pour animer des séances, assemblées ou réunions. Elle offre une interface d'administration pour piloter les votes et une interface simple pour les participants.

## Fonctionnalités principales

* **Création de session simple** : L'organisateur crée une session de vote en un clic et obtient un code court (ex: ABCDE) ainsi qu'un QR code à projeter.
* **Participation instantanée** : Les votants rejoignent la session via le code ou le QR code, sans inscription.
* **Votes en direct** : Les choix (Pour, Contre, Abstention) sont enregistrés en temps réel grâce à Supabase.
* **Gestion du temps** : L'organisateur peut lancer un compte à rebours visuel (barre de progression de 10 secondes) ou prolonger le vote sans limite de temps.
* **Dépouillement instantané** : Suivi des connexions simultanées, affichage des résultats en direct (Mode Organisateur) ou masquage jusqu'à la fin (Mode Présentation).
* **Base de données et Temps réel** : Entièrement propulsé par Supabase (PostgreSQL, Realtime, Presence).

## Structure du projet

* `index.html` / `index.js` : Page d'accueil pour rejoindre ou créer une session.
* `host.html` / `host.js` : Tableau de bord de l'organisateur (gestion du vote, QR code, résultats).
* `vote.html` / `vote.js` : Interface du participant (bulletin de vote).
* `404.html` : Fallback identique à `vote.html` pour gérer le routage des liens courts (ex: domaine.com/CODE).
* `app.js` : Fonctions communes (génération de code, formatage, gestion du stockage local).
* `supabase-config.js` : Configuration du client Supabase.
* `style.css` : Thème visuel sobre (inspiré des registres officiels, bleu marine).

## Prérequis et Installation

1. Disposer d'un projet Supabase (https://supabase.com).
2. Créer les tables nécessaires dans Supabase :
   * `sessions` : `id` (uuid), `code` (text), `status` (text), `host_secret` (text), `created_at` (timestamp).
   * `votes` : `id` (uuid), `session_id` (uuid, reference), `voter_id` (text), `choice` (text).
3. Configurer les accès anonymes et activer les extensions Realtime sur ces tables.
4. Ajouter vos identifiants Supabase dans `supabase-config.js` (ces variables peuvent être injectées lors du déploiement) :
   ```javascript
   window.SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
   window.SUPABASE_ANON_KEY = "VOTRE_CLE_ANON";
   ```

## Hébergement

L'application est composée exclusivement de fichiers statiques (HTML, CSS, JS). Elle peut être hébergée sur n'importe quel serveur web classique ou service de déploiement statique (GitHub Pages, Vercel, Netlify, etc.). 

Si vous utilisez un sous-dossier ou un domaine personnalisé, assurez-vous que la gestion des pages 404 redirige bien vers `404.html` afin que les liens courts fonctionnent correctement.
