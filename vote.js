    const code = getSessionCodeFromLocation();
    const app = document.getElementById("app");

    let sb, session, hasVoted = false, votes = [], voting = false;
    const voterId = getVoterId();
    const DEFAULT_VOTE_SECONDS = 10;
    let countdownDeadline = null;
    let countdownDuration = null;
    let countdownInterval = null;
    let timerProlonged = false;

    function statusLabel(s) {
      return { idle: "En attente du début du vote", voting: "Vote en cours", stopped: "Vote clos", results: "Résultats" }[s] || s;
    }

    function render() {
      if (!session) { app.innerHTML = `<div class="card center hint">Chargement…</div>`; return; }

      if (session.status === "results") {
        renderResults();
        return;
      }

      if (session.status === "voting" && !hasVoted) {
        app.innerHTML = `
          <div class="card center">
            <div class="status-banner voting">Vote en cours</div>
            ${timerMarkup()}
            <p class="hint">Choisissez une option. Vous ne pourrez voter qu'une seule fois.</p>
          </div>
          <div class="choice-grid">
            <button class="choice-btn pour" data-choice="pour">Pour</button>
            <button class="choice-btn contre" data-choice="contre">Contre</button>
            <button class="choice-btn abst" data-choice="abstention">Abstention</button>
          </div>
        `;
        app.querySelectorAll(".choice-btn").forEach((b) => {
          b.onclick = () => castVote(b.dataset.choice);
        });
        return;
      }

      if (hasVoted && session.status !== "results") {
        app.innerHTML = `<div class="card center">${session.status === "voting" ? timerMarkup() : ""}<div class="locked-msg">✓ Votre vote a été enregistré.<br><span class="hint">${session.status === "voting" ? "En attente de la clôture du vote." : "Les votes sont clos."}</span></div></div>`;
        return;
      }

      const banner = session.status === "stopped" ? `<div class="status-banner stopped">Vote clos</div>` : `<div class="status-banner">${statusLabel(session.status)}</div>`;
      app.innerHTML = `<div class="card center">${banner}<p class="locked-msg" style="margin-top:0;">${session.status === "stopped" ? "Les votes sont clos." : "En attente du début du vote…"}</p></div>`;
    }


    function getRemainingSeconds() {
      if (!countdownDeadline || timerProlonged) return 0;
      return Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000));
    }

    function timerMarkup() {
      if (timerProlonged) return "";
      const remainingMs = countdownDeadline ? Math.max(0, countdownDeadline - Date.now()) : 0;
      const pct = countdownDuration ? (remainingMs / countdownDuration) * 100 : 0;
      const warningClass = remainingMs <= 3000 ? "warning" : "";
      return `<div class="timer-bar-track"><div id="timerBarFill" class="timer-bar-fill ${warningClass}" style="width: ${pct}%"></div></div>`;
    }

    function stopLocalTimer() {
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = null;
      countdownDeadline = null;
    }

    function beginLocalTimer(seconds = DEFAULT_VOTE_SECONDS) {
      if (countdownInterval) clearInterval(countdownInterval);
      timerProlonged = false;
      countdownDuration = seconds * 1000;
      countdownDeadline = Date.now() + countdownDuration;
      countdownInterval = setInterval(() => {
        const remainingMs = Math.max(0, countdownDeadline - Date.now());
        const timerBarFill = document.getElementById("timerBarFill");
        if (timerBarFill) {
          const pct = (remainingMs / countdownDuration) * 100;
          timerBarFill.style.width = pct + "%";
          if (remainingMs <= 3000) {
            timerBarFill.classList.add("warning");
          }
        }
        if (remainingMs <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }, 50);
      render();
    }

    function markTimerProlonged() {
      stopLocalTimer();
      timerProlonged = true;
      render();
    }

    function renderResults() {
      const counts = tallyCounts(votes);
      const total = counts.pour + counts.contre + counts.abstention;
      let verdict = "Égalité";
      let verdictClass = "";
      if (counts.pour > counts.contre) { verdict = "Résultat : Pour"; verdictClass = "pour"; }
      else if (counts.contre > counts.pour) { verdict = "Résultat : Contre"; verdictClass = "contre"; }

      app.innerHTML = `
        <div class="card">
          <div class="verdict ${verdictClass}">${verdict}</div>
          <div class="turnout">${total} votant${total > 1 ? "s" : ""}</div>
          <div class="tally">
            ${tallyRow("Pour", "pour", counts.pour, total)}
            ${tallyRow("Contre", "contre", counts.contre, total)}
            ${tallyRow("Abstention", "abst", counts.abstention, total)}
          </div>
        </div>
      `;
    }

    function tallyRow(label, cls, count, total) {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div class="label ${cls}">${label}</div>
        <div class="count">${count}</div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      `;
    }

    async function castVote(choice) {
      if (voting) return;
      voting = true;
      app.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
      const { error } = await sb.from("votes").insert({ session_id: session.id, voter_id: voterId, choice });
      voting = false;
      if (error) {
        if (error.code === "23505") {
          hasVoted = true; // déjà voté (double clic ou autre onglet)
          render();
        } else {
          alert("Erreur : " + error.message);
          app.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = false));
        }
        return;
      }
      hasVoted = true;
      render();
    }

    async function fetchVotesForResults() {
      const { data } = await sb.from("votes").select("choice").eq("session_id", session.id);
      votes = data || [];
      render();
    }

    async function checkHasVoted() {
      const { data } = await sb.from("votes").select("id").eq("session_id", session.id).eq("voter_id", voterId).maybeSingle();
      hasVoted = !!data;
    }

    function subscribeRealtime() {
      const channel = sb.channel("session-" + session.id, { config: { presence: { key: voterId } } });
      channel
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` }, async (payload) => {
          const previousStatus = session.status;
          session.status = payload.new.status;
          if (session.status === "voting" && previousStatus !== "voting") {
            beginLocalTimer(DEFAULT_VOTE_SECONDS);
          } else if (session.status !== "voting") {
            stopLocalTimer();
            timerProlonged = false;
          }
          if (session.status === "results") {
            fetchVotesForResults();
          } else if (session.status === "idle" && previousStatus !== "idle") {
            // L'organisateur a lancé un nouveau tour de vote dans la même
            // session : les votes précédents ont été effacés côté serveur,
            // donc on revérifie si on a déjà voté (normalement plus le cas).
            await checkHasVoted();
            render();
          } else {
            render();
          }
        })
        .on("broadcast", { event: "vote_timer" }, ({ payload }) => {
          beginLocalTimer(payload?.seconds || DEFAULT_VOTE_SECONDS);
        })
        .on("broadcast", { event: "vote_timer_prolonged" }, () => {
          markTimerProlonged();
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` }, () => {
          // La session a été clôturée et supprimée automatiquement (15h écoulées).
          session = null;
          document.getElementById("expiryNote").style.display = "none";
          app.innerHTML = `<div class="card center hint">Cette session a été clôturée automatiquement (15h écoulées) et n'est plus disponible.</div>`;
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Signale la présence de ce votant sur le canal de la session,
            // pour que host.html puisse afficher le nombre de connexions en direct.
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    }

    async function init() {
      if (!code) {
        app.innerHTML = `<div class="card center hint">Aucun code de session fourni.</div>`;
        return;
      }
      sb = getSupabaseClient();
      const { data, error } = await sb.from("sessions").select("*").eq("code", code.toUpperCase()).single();
      if (error || !data) {
        app.innerHTML = `<div class="card center hint">Session introuvable. Vérifiez le code : <strong>${code}</strong></div>`;
        return;
      }
      session = data;
      const expiryNote = document.getElementById("expiryNote");
      const expiry = formatExpiryDate(session);
      if (expiry) {
        expiryNote.textContent = `Cette session expirera automatiquement le ${expiry}.`;
        expiryNote.style.display = "block";
      }
      await checkHasVoted();
      if (session.status === "results") await fetchVotesForResults();
      else {
        if (session.status === "voting") beginLocalTimer(DEFAULT_VOTE_SECONDS);
        else render();
      }
      subscribeRealtime();
    }

    init();
