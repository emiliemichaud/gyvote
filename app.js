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

function voteUrlForCode(code) {
  const url = new URL("vote.html", window.location.href);
  url.searchParams.set("s", code);
  return url.toString();
}

function tallyCounts(votes) {
  const counts = { pour: 0, contre: 0, abstention: 0 };
  for (const v of votes) {
    if (counts[v.choice] !== undefined) counts[v.choice]++;
  }
  return counts;
}