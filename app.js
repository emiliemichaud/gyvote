// ============================================================
// Fonctions partagées entre host.html et vote.html
// ============================================================

function getSupabaseClient() {
  if (!window.supabase) {
    throw new Error("Le SDK Supabase ne s'est pas chargé (vérifie ta connexion).");
  }
  if (!window._sbClient) {
    const url = (window.SUPABASE_URL || "").trim();
    const key = (window.SUPABASE_ANON_KEY || "").trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      throw new Error(
        "SUPABASE_URL invalide dans supabase-config.js. Attendu : https://xxxxxxxx.supabase.co " +
        "(sans / final, sans /rest/v1). Valeur actuelle : \"" + url + "\""
      );
    }
    if (!key || key === "VOTRE_CLE_ANON_PUBLIQUE" || key.length < 20) {
      throw new Error("SUPABASE_ANON_KEY manquante ou invalide dans supabase-config.js.");
    }
    window._sbClient = window.supabase.createClient(url, key);
  }
  return window._sbClient;
}

// Code court, lisible, sans caractères ambigus (0/O, 1/I)
function generateSessionCode(length = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// Identifiant anonyme et persistant du votant, propre à ce navigateur
function getVoterId() {
  let id = localStorage.getItem("voter_id");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    localStorage.setItem("voter_id", id);
  }
  return id;
}

// Construit le lien court : https://ton-domaine/CODE
// (au lieu de vote.html?s=CODE). Le CODE est ensuite retrouvé côté
// vote.html grâce à getSessionCodeFromLocation(), avec l'aide de
// 404.html qui prend le relais quand GitHub Pages ne trouve pas de
// fichier correspondant au chemin demandé.
function voteUrlForCode(code) {
  return window.location.origin + "/" + code;
}

// Noms de fichiers à ignorer si jamais ils apparaissent dans le chemin
// (cas où quelqu'un visite encore une ancienne URL du type /vote.html)
const RESERVED_PATH_NAMES = ["", "index.html", "vote.html", "host.html", "404.html"];

// Retrouve le code de session, qu'il soit passé en ?s=CODE (ancien format)
// ou directement dans le chemin /CODE (nouveau format de lien court).
function getSessionCodeFromLocation() {
  const fromQuery = new URLSearchParams(window.location.search).get("s");
  if (fromQuery) return fromQuery;

  const segment = window.location.pathname.split("/").filter(Boolean).pop() || "";
  if (!RESERVED_PATH_NAMES.includes(segment.toLowerCase())) {
    return segment;
  }
  return null;
}

function tallyCounts(votes) {
  const counts = { pour: 0, contre: 0, abstention: 0 };
  for (const v of votes) {
    if (counts[v.choice] !== undefined) counts[v.choice]++;
  }
  return counts;
}