// ============================================================
// Fonctions partagées entre host.html et vote.html
// (API Cloudflare Workers — remplace le SDK Supabase)
// ============================================================

// URL de base de l'API Worker (définie dans api-config.js)
function getApiBase() {
  return (window.API_BASE || "").replace(/\/$/, "");
}

// ─── Wrappers API ────────────────────────────────────────────────────────────

async function apiPost(path, body) {
  const res = await fetch(getApiBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiGet(path) {
  const res = await fetch(getApiBase() + path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiPatch(path, body) {
  const res = await fetch(getApiBase() + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiDelete(path) {
  const res = await fetch(getApiBase() + path, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ─── Utilitaires (inchangés) ─────────────────────────────────────────────────

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
function voteUrlForCode(code) {
  return window.location.origin + "/" + code;
}

// Noms de fichiers à ignorer si jamais ils apparaissent dans le chemin
const RESERVED_PATH_NAMES = ["", "index.html", "vote.html", "host.html", "404.html"];

// Retrouve le code de session, qu'il soit passé en ?s=CODE ou /CODE
function getSessionCodeFromLocation() {
  const fromQuery = new URLSearchParams(window.location.search).get("s");
  if (fromQuery) return fromQuery;

  const segment = window.location.pathname.split("/").filter(Boolean).pop() || "";
  if (!RESERVED_PATH_NAMES.includes(segment.toLowerCase())) {
    return segment;
  }
  return null;
}

// Formate la date/heure à laquelle une session sera supprimée automatiquement
// (created_at + 15h), au format "JJ.MM.AAAA à HH:MM"
function formatExpiryDate(session) {
  if (!session || !session.created_at) return null;
  const created = new Date(session.created_at);
  const expiry = new Date(created.getTime() + 15 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(expiry.getDate())}.${pad(expiry.getMonth() + 1)}.${expiry.getFullYear()} à ${pad(expiry.getHours())}:${pad(expiry.getMinutes())}`;
}

function tallyCounts(votes) {
  const counts = { pour: 0, contre: 0, abstention: 0 };
  for (const v of votes) {
    if (counts[v.choice] !== undefined) counts[v.choice]++;
  }
  return counts;
}