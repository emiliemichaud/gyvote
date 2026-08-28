import { DurableObject } from "cloudflare:workers";

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

function uuid() {
  return crypto.randomUUID();
}

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

export class SessionDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.sessions = new Map();
  }

  async ensureInit(code) {
    if (!code) return null;
    let session = await this.ctx.storage.get("session");
    if (!session) {
      try {
        session = await this.env.DB.prepare("SELECT * FROM sessions WHERE code = ?").bind(code).first();
        if (session) {
          await this.ctx.storage.put("session", session);
          const { results } = await this.env.DB.prepare("SELECT choice, voter_id FROM votes WHERE session_id = ?").bind(session.id).all();
          await this.ctx.storage.put("votes", results || []);
        }
      } catch (e) {
        console.error("DB Init Error:", e);
      }
    }
    return session;
  }

  async broadcastState() {
    try {
      const session = await this.ctx.storage.get("session");
      if (!session) return;
      
      const votes = await this.ctx.storage.get("votes") || [];
      
      const uniqueVoters = new Set();
      for (const info of this.sessions.values()) {
        if (info.voterId) uniqueVoters.add(info.voterId);
      }
      const onlineCount = uniqueVoters.size;

      const payload = JSON.stringify({
        type: "state",
        session,
        votes,
        onlineCount
      });
      
      console.log(`[DO] Broadcasting to ${this.sessions.size} connections. Payload:`, payload);

      for (const [ws, info] of this.sessions.entries()) {
        try {
          ws.send(payload);
        } catch (e) {
          console.error("[DO] Error sending to WS:", e);
          this.sessions.delete(ws);
        }
      }
    } catch (e) {
      console.error("[DO] Error in broadcastState:", e);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    console.log(`[DO] fetch: ${request.method} ${url.pathname}`);
    
    try {
      const codeMatch = url.pathname.match(/\/session\/([A-Z0-9]+)/i) || url.pathname.match(/\/code\/([A-Z0-9]+)/i);
      if (codeMatch) {
        await this.ensureInit(codeMatch[1].toUpperCase());
      }

      if (url.pathname.endsWith("/ws")) {
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
          return new Response("Expected WebSocket", { status: 426 });
        }
        
        const voterId = url.searchParams.get("voter_id");
        const role = url.searchParams.get("role") || "voter";

        const { 0: client, 1: server } = new WebSocketPair();
        server.accept();
        
        this.sessions.set(server, { voterId, role });
        console.log(`[DO] WS Connected. Role: ${role}, Voter: ${voterId}`);
        
        server.addEventListener("close", () => {
          console.log(`[DO] WS Closed`);
          this.sessions.delete(server);
          this.ctx.waitUntil(this.broadcastState());
        });
        
        server.addEventListener("error", (e) => {
          console.error(`[DO] WS Error:`, e);
          this.sessions.delete(server);
          this.ctx.waitUntil(this.broadcastState());
        });

        // Always broadcast on new connection
        this.ctx.waitUntil(this.broadcastState());
        
        return new Response(null, {
          status: 101,
          webSocket: client
        });
      }

      if (request.method === "POST" && url.pathname.endsWith("/init")) {
        const body = await request.json();
        await this.ctx.storage.put("session", body.session);
        await this.ctx.storage.put("votes", []);
        return json({ ok: true });
      }

      if (request.method === "PATCH" && url.pathname.endsWith("/status")) {
        const body = await request.json();
        const session = await this.ctx.storage.get("session");
        if (session) {
          session.status = body.status;
          await this.ctx.storage.put("session", session);
          await this.env.DB.prepare("UPDATE sessions SET status = ? WHERE id = ?").bind(body.status, session.id).run();
          this.ctx.waitUntil(this.broadcastState());
        }
        return json({ ok: true });
      }

      if (request.method === "DELETE" && url.pathname.includes("/votes")) {
        await this.ctx.storage.put("votes", []);
        const session = await this.ctx.storage.get("session");
        if (session) {
          await this.env.DB.prepare("DELETE FROM votes WHERE session_id = ?").bind(session.id).run();
        }
        this.ctx.waitUntil(this.broadcastState());
        return json({ ok: true });
      }

      if (request.method === "DELETE" && url.pathname.includes("/session")) {
        await this.ctx.storage.deleteAll();
        for (const ws of this.sessions.keys()) {
          ws.close(1000, "Session deleted");
        }
        this.sessions.clear();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname.endsWith("/vote")) {
        const body = await request.json();
        const votes = await this.ctx.storage.get("votes") || [];
        
        if (votes.some(v => v.voter_id === body.voter_id)) {
          return err("Déjà voté", 409);
        }
        
        const newVote = { choice: body.choice, voter_id: body.voter_id };
        votes.push(newVote);
        await this.ctx.storage.put("votes", votes);
        
        const session = await this.ctx.storage.get("session");
        if (session) {
          await this.env.DB.prepare(
            "INSERT INTO votes (id, session_id, voter_id, choice) VALUES (?, ?, ?, ?)"
          ).bind(uuid(), session.id, body.voter_id, body.choice).run();
        }
        
        this.ctx.waitUntil(this.broadcastState());
        return json({ ok: true });
      }
      
      return new Response("Not found in DO", { status: 404 });
    } catch (e) {
      console.error("[DO] Unhandled Error:", e);
      return new Response("DO Error", { status: 500 });
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const matchWs = path.match(/^\/api\/session\/([A-Z0-9]{3,16})\/ws$/i);
      if (matchWs) {
        const code = matchWs[1].toUpperCase();
        const id = env.SESSION_DO.idFromName(code);
        const stub = env.SESSION_DO.get(id);
        return stub.fetch(request);
      }

      if (method === "POST" && path === "/api/session") {
        const body = await request.json().catch(() => ({}));
        const title = (body.title || "").trim() || null;

        let code;
        let attempts = 0;
        while (attempts < 5) {
          code = generateCode();
          const existing = await env.DB.prepare("SELECT id FROM sessions WHERE code = ?").bind(code).first();
          if (!existing) break;
          attempts++;
        }

        const id = uuid();
        const hostSecret = uuid();
        const sessionData = { id, code, host_secret: hostSecret, status: 'idle', title, created_at: new Date().toISOString() };

        await env.DB.prepare(
          `INSERT INTO sessions (id, code, host_secret, status, title) VALUES (?, ?, ?, 'idle', ?)`
        ).bind(id, code, hostSecret, title).run();

        const doId = env.SESSION_DO.idFromName(code);
        const stub = env.SESSION_DO.get(doId);
        await stub.fetch(new Request("http://do/init", {
          method: "POST",
          body: JSON.stringify({ session: sessionData })
        }));

        return json(sessionData, 201, origin);
      }

      const matchCode = path.match(/^\/api\/session\/([A-Z0-9]{3,16})$/i);
      if (method === "GET" && matchCode && !path.endsWith('/ws')) {
        const code = matchCode[1].toUpperCase();
        const session = await env.DB.prepare("SELECT * FROM sessions WHERE code = ?").bind(code).first();
        if (!session) return err("Session introuvable", 404, origin);
        return json(session, 200, origin);
      }

      const matchStatus = path.match(/^\/api\/session\/([0-9a-f\-]{36})\/status$/i);
      if (method === "PATCH" && matchStatus) {
        const session = await env.DB.prepare("SELECT code FROM sessions WHERE id = ?").bind(matchStatus[1]).first();
        if (session) {
          const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(session.code));
          return stub.fetch(new Request(`http://do/code/${session.code}/status`, { method: "PATCH", body: JSON.stringify(await request.json()) }));
        }
      }

      const matchDelSession = path.match(/^\/api\/session\/([0-9a-f\-]{36})$/i);
      if (method === "DELETE" && matchDelSession) {
        const session = await env.DB.prepare("SELECT code FROM sessions WHERE id = ?").bind(matchDelSession[1]).first();
        if (session) {
          await env.DB.prepare("DELETE FROM votes WHERE session_id = ?").bind(matchDelSession[1]).run();
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(matchDelSession[1]).run();
          const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(session.code));
          return stub.fetch(new Request(`http://do/code/${session.code}/session`, { method: "DELETE" }));
        }
      }

      if (method === "POST" && path === "/api/vote") {
        const bodyText = await request.text();
        const bodyObj = JSON.parse(bodyText);
        const session = await env.DB.prepare("SELECT code, status FROM sessions WHERE id = ?").bind(bodyObj.session_id).first();
        if (!session) return err("Session introuvable", 404, origin);
        if (session.status !== "voting") return err("Le vote n'est pas ouvert", 403, origin);
        
        const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(session.code));
        return stub.fetch(new Request(`http://do/code/${session.code}/vote`, { method: "POST", body: bodyText }));
      }

      const matchDelVotes = path.match(/^\/api\/votes\/([0-9a-f\-]{36})$/i);
      if (method === "DELETE" && matchDelVotes) {
        const session = await env.DB.prepare("SELECT code FROM sessions WHERE id = ?").bind(matchDelVotes[1]).first();
        if (session) {
          const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(session.code));
          return stub.fetch(new Request(`http://do/code/${session.code}/votes`, { method: "DELETE" }));
        }
      }

      if (method === "GET" && matchDelVotes) { 
        const sessionId = matchDelVotes[1];
        const { results } = await env.DB.prepare("SELECT choice, voter_id FROM votes WHERE session_id = ?").bind(sessionId).all();
        return json(results || [], 200, origin);
      }

      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("Worker Error:", e);
      return err("Erreur serveur : " + e.message, 500, origin);
    }
  },

  async scheduled(event, env, ctx) {
    const cutoff15h = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM votes WHERE session_id IN (SELECT id FROM sessions WHERE created_at < ?)").bind(cutoff15h).run();
    await env.DB.prepare("DELETE FROM sessions WHERE created_at < ?").bind(cutoff15h).run();
  },
};
