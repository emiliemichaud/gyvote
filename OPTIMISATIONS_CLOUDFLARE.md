# Optimisations Cloudflare (Branche "Light")

Ce document résume les modifications architecturales apportées pour adapter Gyvote aux limites de l'offre gratuite de Cloudflare (Workers et D1), notamment pour supporter des sessions longues (ex: 30 minutes) avec un grand nombre de participants (ex: 100+ personnes).

## Objectif des quotas Cloudflare (Offre Gratuite)
- **Worker Requests** : 100 000 requêtes HTTP / jour.
- **D1 Rows Read (Lectures)** : 5 000 000 de lignes lues / jour.
- **D1 Rows Written (Écritures)** : 100 000 lignes écrites / jour.

---

## 1. Gestion de la Présence (Réduction des Écritures D1)
**Problème initial :** 
Le système utilisait un *heartbeat* où chaque participant envoyait un ping au serveur toutes les 10 secondes pour signaler sa présence. Pour 100 participants sur 30 minutes, cela générait 18 000 écritures (Writes) en base de données, menaçant le quota journalier.

**Solution :**
- **Côté Frontend (`vote.html`) :** Suppression du `setInterval` de 10s. Le participant s'enregistre désormais **une seule fois** au moment où il se connecte à la session (`registerPresence`).
- **Côté Backend (`worker/index.js`) :** La route de comptage de présence `GET /api/presence/:sessionId` ne filtre plus sur les 30 dernières secondes, mais compte simplement le nombre total de participants uniques ayant rejoint la session.
- **Nettoyage :** La tâche planifiée (cron) ne supprime plus les présences inactives à la minute, mais les purge en même temps que la session (au bout de 15h).

## 2. Polling Dynamique (Réduction des Requêtes HTTP Workers)
**Problème initial :** 
Les téléphones des participants interrogeaient le serveur toutes les 3 secondes en continu (`setInterval`), générant plus de 60 000 requêtes HTTP pour 100 utilisateurs sur 30 minutes (soit 60% du quota quotidien).

**Solution :**
- Mise en place d'un polling adaptatif via un système de boucle `setTimeout` dans `vote.html`. Le délai s'adapte au contexte :
  - **10 secondes** lors des phases "En attente" (`idle`) et "Clos" (`stopped`).
  - **3 secondes** lors de la phase de "Vote" (`voting`) pour garder une réactivité instantanée à la clôture.
  - **15 secondes** lors de la phase des "Résultats" (`results`), car l'action est terminée.

## 3. Optimisation des Résultats (Réduction des Lectures D1)
**Problème initial :** 
Lorsque l'animateur affichait les résultats, le polling classique des participants forçait le re-téléchargement de tous les votes toutes les 3 secondes. Avec 100 votes, cela scannait 100 lignes en base *par participant* toutes les 3s (soit jusqu'à 1 000 000 de lignes lues en quelques minutes).

**Solution :**
- **Côté Frontend (`vote.html`) :** La logique de `poll()` a été modifiée pour détecter la *transition* vers l'état "Résultats". Les votes ne sont téléchargés **qu'une seule fois** au moment du changement d'état. Les appels suivants ne font que vérifier le statut de la session.

---

## Bilan des gains
Avec ces trois optimisations combinées pour un scénario de 100 professeurs sur 30 minutes :
* **Requêtes HTTP (Workers)** : Passent de ~80 000 à **~26 000** (Possibilité de faire 3 à 4 grosses sessions par jour gratuitement).
* **Écritures D1 (Writes)** : Passent de ~18 100 à **~200** (-99% de charge d'écriture).
* **Lectures D1 (Reads)** : Passent potentiellement de > 1 000 000 à **~190 000** (-85% de charge de lecture).

*Note : Ces optimisations rendent le recours à un service externe de WebSockets (ex: Pusher) ou à Cloudflare Durable Objects inutile pour maintenir le service sur un modèle 100% gratuit.*
