/**
 * Cloudflare Worker — API REST pour gyvote
 * Remplace Supabase (PostgREST + Auth + Cron)
 *
 * Structure DB (D1 / SQLite) :
 *   sessions : id (UUID TEXT), code, host_secret (UUID TEXT), status, title, created_at
 *   votes    : id (UUID TEXT), session_id, voter_id, choice, created_at
 *
 * Routes :
 *   POST   /api/session              Créer une session
 *   GET    /api/session/:code        Lire une session par son code
 *   PATCH  /api/session/:id/status   Changer le statut d'une session
 *   DELETE /api/session/:id          Supprimer une session et ses votes
 *   POST   /api/vote                 Enregistrer un vote
 *   GET    /api/votes/:sessionId     Lire les votes d'une session
 *   DELETE /api/votes/:sessionId     Supprimer tous les votes d'une session (nouveau tour)
 *
 * Cron : nettoie les sessions de plus de 15h toutes les 15 minutes
 */

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function err(message, status = 400, origin) {
  return json({ error: message }, status, origin);
}

// Génère un UUID v4 aléatoire (disponible dans le runtime Cloudflare Workers)
function uuid() {
  return crypto.randomUUID();
}

// Code court, lisible, sans caractères ambigus (0/O, 1/I) — identique au frontend
function generateCode(length = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    out += alphabet[array[i] % alphabet.length];
  }
  return out;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Pré-vol CORS
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {

      // ── POST /api/session ── Créer une session ──────────────────────────
      if (method === "POST" && path === "/api/session") {
        const body = await request.json().catch(() => ({}));
        const title = (body.title || "").trim() || null;

        let code;
        let attempts = 0;
        while (attempts < 5) {
          code = generateCode();
          const existing = await env.DB.prepare(
            "SELECT id FROM sessions WHERE code = ?"
          ).bind(code).first();
          if (!existing) break;
          attempts++;
        }

        const id = uuid();
        const hostSecret = uuid();

        const result = await env.DB.prepare(
          `INSERT INTO sessions (id, code, host_secret, status, title)
           VALUES (?, ?, ?, 'idle', ?)
           RETURNING id, code, host_secret, status, title, created_at`
        ).bind(id, code, hostSecret, title).first();

        return json(result, 201, origin);
      }

      // ── GET /api/session/:code ── Lire une session par son code ─────────
      const matchCode = path.match(/^\/api\/session\/([A-Z0-9]{3,16})$/i);
      if (method === "GET" && matchCode) {
        const code = matchCode[1].toUpperCase();
        const session = await env.DB.prepare(
          "SELECT * FROM sessions WHERE code = ?"
        ).bind(code).first();
        if (!session) return err("Session introuvable", 404, origin);
        return json(session, 200, origin);
      }

      // ── PATCH /api/session/:id/status ── Changer le statut ──────────────
      const matchStatus = path.match(
        /^\/api\/session\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/status$/i
      );
      if (method === "PATCH" && matchStatus) {
        const id = matchStatus[1];
        const body = await request.json();
        const { status } = body;
        const allowed = ["idle", "voting", "stopped", "results"];
        if (!allowed.includes(status)) return err("Statut invalide", 400, origin);
        await env.DB.prepare(
          "UPDATE sessions SET status = ? WHERE id = ?"
        ).bind(status, id).run();
        return json({ ok: true }, 200, origin);
      }

      // ── DELETE /api/session/:id ── Supprimer une session et ses données ────
      const matchSession = path.match(
        /^\/api\/session\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
      );
      if (method === "DELETE" && matchSession) {
        const id = matchSession[1];
        await env.DB.prepare("DELETE FROM votes WHERE session_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM presence WHERE session_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
        return json({ ok: true }, 200, origin);
      }

      // ── POST /api/vote ── Enregistrer un vote ────────────────────────────
      if (method === "POST" && path === "/api/vote") {
        const body = await request.json();
        const { session_id, voter_id, choice } = body;
        if (
          !session_id || !voter_id ||
          !["pour", "contre", "abstention"].includes(choice)
        ) {
          return err("Paramètres invalides", 400, origin);
        }

        // Vérifier que la session existe et est en statut 'voting'
        const session = await env.DB.prepare(
          "SELECT id, status FROM sessions WHERE id = ?"
        ).bind(session_id).first();
        if (!session) return err("Session introuvable", 404, origin);
        if (session.status !== "voting") return err("Le vote n'est pas ouvert", 403, origin);

        try {
          const voteId = uuid();
          await env.DB.prepare(
            "INSERT INTO votes (id, session_id, voter_id, choice) VALUES (?, ?, ?, ?)"
          ).bind(voteId, session_id, voter_id, choice).run();
          return json({ ok: true }, 201, origin);
        } catch (e) {
          // Contrainte UNIQUE (session_id, voter_id) : déjà voté
          if (e.message && e.message.includes("UNIQUE")) {
            return err("Déjà voté", 409, origin);
          }
          throw e;
        }
      }

      // ── GET /api/votes/:sessionId ── Lire les votes d'une session ────────
      const matchVotes = path.match(
        /^\/api\/votes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
      );
      if (method === "GET" && matchVotes) {
        const sessionId = matchVotes[1];
        const { results } = await env.DB.prepare(
          "SELECT choice, voter_id FROM votes WHERE session_id = ?"
        ).bind(sessionId).all();
        return json(results || [], 200, origin);
      }

      // ── DELETE /api/votes/:sessionId ── Supprimer les votes (nouveau tour)
      if (method === "DELETE" && matchVotes) {
        const sessionId = matchVotes[1];
        await env.DB.prepare("DELETE FROM votes WHERE session_id = ?").bind(sessionId).run();
        return json({ ok: true }, 200, origin);
      }

      // ── POST /api/presence/:sessionId ── Heartbeat du votant ─────────────
      // Signale que ce votant est actif. Upsert de last_seen.
      const matchPresence = path.match(
        /^\/api\/presence\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
      );
      if (method === "POST" && matchPresence) {
        const sessionId = matchPresence[1];
        const body = await request.json().catch(() => ({}));
        const { voter_id } = body;
        if (!voter_id) return err("voter_id manquant", 400, origin);
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO presence (session_id, voter_id, last_seen)
           VALUES (?, ?, ?)
           ON CONFLICT (session_id, voter_id) DO UPDATE SET last_seen = excluded.last_seen`
        ).bind(sessionId, voter_id, now).run();
        return json({ ok: true }, 200, origin);
      }

      // ── GET /api/presence/:sessionId ── Nombre de participants ────────────
      // Compte le nombre total de votants ayant rejoint la session.
      if (method === "GET" && matchPresence) {
        const sessionId = matchPresence[1];
        const row = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM presence WHERE session_id = ?"
        ).bind(sessionId).first();
        return json({ count: row?.count ?? 0 }, 200, origin);
      }

      // Toutes les autres requêtes (/, /host.html, /CODE, etc.)
      // sont servies par les assets statiques (dossier public/).
      // Pour /CODE : assets ne trouve pas le fichier → renvoie 404.html
      // (configuré avec not_found_handling = "404-page") qui est la page de vote.
      return env.ASSETS.fetch(request);

    } catch (e) {
      console.error(e);
      return err("Erreur serveur : " + e.message, 500, origin);
    }
  },

  // ─── Cron : nettoyage des sessions et présences expirées (toutes les 15 min)
  async scheduled(event, env, ctx) {
    const cutoff15h = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();
    // Supprimer les votes, présences et sessions de plus de 15h
    await env.DB.prepare(
      "DELETE FROM votes WHERE session_id IN (SELECT id FROM sessions WHERE created_at < ?)"
    ).bind(cutoff15h).run();
    await env.DB.prepare(
      "DELETE FROM presence WHERE session_id IN (SELECT id FROM sessions WHERE created_at < ?)"
    ).bind(cutoff15h).run();
    await env.DB.prepare(
      "DELETE FROM sessions WHERE created_at < ?"
    ).bind(cutoff15h).run();
    console.log("Cleanup effectué, cutoff sessions :", cutoff15h);
  },
};
