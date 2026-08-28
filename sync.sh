#!/usr/bin/env bash
# Synchronise les fichiers frontend de la racine vers public/
# À lancer avant wrangler dev, ou pendant le dev quand on modifie un fichier.

mkdir -p public/vendor

cp index.html host.html vote.html 404.html confidentialite.html style.css app.js api-config.js public/
cp vendor/* public/vendor/ 2>/dev/null || true
echo "✅ Sync racine → public/"
