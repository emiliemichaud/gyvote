#!/usr/bin/env bash
# ============================================================
# Script de développement local pour gyvote
# Lance le Worker (port 8787) et sert le frontend (port 8080)
# ============================================================

# Basculer api-config.js en mode local
cp api-config.js api-config.prod.js 2>/dev/null || true
cp api-config.local.js api-config.js
echo "✅ api-config.js → http://localhost:8787"

# Piège pour restaurer api-config.js à la fin (Ctrl+C)
cleanup() {
  echo ""
  echo "🔄 Restauration de api-config.js (production)…"
  cp api-config.prod.js api-config.js 2>/dev/null || true
  kill "$WORKER_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  echo "👋 Terminé."
}
trap cleanup EXIT INT TERM

# Lancer le Worker en arrière-plan
echo "🚀 Démarrage du Worker sur http://localhost:8787 …"
wrangler dev --local &
WORKER_PID=$!

# Attendre que le Worker démarre
sleep 3

# Servir le frontend en arrière-plan
echo "🌐 Démarrage du frontend sur http://localhost:8080 …"
npx --yes serve . -p 8080 &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend : http://localhost:8080"
echo "  Worker   : http://localhost:8787"
echo "  Appuyer sur Ctrl+C pour tout arrêter"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Attendre que les deux processus se terminent
wait
