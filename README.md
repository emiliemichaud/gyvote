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
2. Créer les tables, les politiques de sécurité (RLS) et activer le temps réel en exécutant ce script SQL dans le **SQL Editor** de Supabase :

   ```sql
   -- 1. Création de la table 'sessions'
   CREATE TABLE sessions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     code text UNIQUE NOT NULL,
     status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'voting', 'prolonged', 'stopped', 'results')),
     host_secret text NOT NULL DEFAULT gen_random_uuid()::text,
     created_at timestamptz NOT NULL DEFAULT now()
   );

   -- 2. Création de la table 'votes'
   CREATE TABLE votes (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     voter_id text NOT NULL,
     choice text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (session_id, voter_id)
   );

   -- 3. Activer Row Level Security (RLS)
   ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

   -- 4. Politiques pour 'sessions' (Application publique, tout le monde peut gérer les sessions)
   CREATE POLICY "sessions: lecture publique" ON sessions FOR SELECT USING (true);
   CREATE POLICY "sessions: insertion publique" ON sessions FOR INSERT WITH CHECK (true);
   CREATE POLICY "sessions: mise à jour publique" ON sessions FOR UPDATE USING (true);
   CREATE POLICY "sessions: suppression publique" ON sessions FOR DELETE USING (true);

   -- 5. Politiques pour 'votes' (Seulement si le vote est ouvert ou prolongé)
   CREATE POLICY "votes: lecture publique" ON votes FOR SELECT USING (true);
   CREATE POLICY "votes: uniquement si vote ouvert" ON votes FOR INSERT WITH CHECK (
     EXISTS (
       SELECT 1 FROM sessions
       WHERE sessions.id = session_id
         AND sessions.status IN ('voting', 'prolonged')
     )
   );
   CREATE POLICY "votes: suppression publique" ON votes FOR DELETE USING (true);

   -- 6. Activer le temps réel (Realtime)
   ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
   ALTER PUBLICATION supabase_realtime ADD TABLE votes;
   ```

3. Ajouter vos identifiants Supabase dans le fichier `supabase-config.js` (ces variables peuvent être injectées lors du déploiement) :
   ```javascript
   window.SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
   window.SUPABASE_ANON_KEY = "VOTRE_CLE_ANON";
   ```

## Hébergement

L'application est composée exclusivement de fichiers statiques (HTML, CSS, JS). Elle peut être hébergée sur n'importe quel serveur web classique ou service de déploiement statique (GitHub Pages, Vercel, Netlify, etc.). 

Si vous utilisez un sous-dossier ou un domaine personnalisé, assurez-vous que la gestion des pages 404 redirige bien vers `404.html` afin que les liens courts fonctionnent correctement.
