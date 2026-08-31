    const params = new URLSearchParams(window.location.search);
    const code = params.get("s");
    const secret = params.get("t");
    const app = document.getElementById("app");

    let session = null;
    let votes = [];
    let onlineCount = 0;
    let sb;

    const DEFAULT_VOTE_SECONDS = 10;
    let countdownDeadline = null;
    let countdownDuration = null;
    let countdownInterval = null;
    let timerProlonged = false;
    let autoStopInProgress = false;
    let presentationMode = false;

    function statusLabel(s) {
      return { idle: "En attente", voting: "Vote en cours", stopped: "Vote clos", results: "Résultats affichés" }[s] || s;
    }

    function render() {
      if (!session) {
        app.innerHTML = `<div class="card center hint">Chargement…</div>`;
        return;
      }
      const counts = tallyCounts(votes);
      const total = counts.pour + counts.contre + counts.abstention;
      const url = voteUrlForCode(session.code);
      const bannerClass = session.status === "voting" ? "voting" : session.status === "stopped" ? "stopped" : "";
      
      let timerHtml = "";
      if (session.status === "voting") {
        if (timerProlonged) {
          timerHtml = `<div class="vote-timer-extended">Temps prolongé</div>`;
        } else {
          const remainingMs = countdownDeadline ? Math.max(0, countdownDeadline - Date.now()) : 0;
          const pct = countdownDuration ? (remainingMs / countdownDuration) * 100 : 0;
          const warningClass = remainingMs <= 3000 ? "warning" : "";
          timerHtml = `<div class="timer-bar-track"><div id="timerBarFill" class="timer-bar-fill ${warningClass}" style="width: ${pct}%"></div></div>`;
        }
      }

      let lowerContent = "";
      if (session.status === "results") {
        lowerContent = buildResultCard(counts, total, presentationMode, onlineCount);
      } else if (!presentationMode) {
        lowerContent = `
        <div class="card">
          <div class="eyebrow center" style="display:block; margin-bottom:6px;">Dépouillement en direct</div>
          <div class="turnout" style="margin-bottom:8px;">${onlineCount} connexion${onlineCount > 1 ? "s" : ""} en ce moment</div>
          <div class="tally">
            ${tallyRow("Pour", "pour", counts.pour, total)}
            ${tallyRow("Contre", "contre", counts.contre, total)}
            ${tallyRow("Abstention", "abst", counts.abstention, total)}
          </div>
          <div class="turnout" style="margin-top:14px;">${total} vote${total > 1 ? "s" : ""} enregistré${total > 1 ? "s" : ""}</div>
        </div>
        `;
      }

      const startBtnText = session.status === "idle" ? "Démarrer les votes" : "Prolonger le vote de 10 secondes";
      const extendBtnDisabled = (session.status === "idle" || (session.status === "voting" && timerProlonged)) ? "disabled" : "";

      app.innerHTML = `
        <div class="card center">
          <div class="status-banner ${bannerClass}">${statusLabel(session.status)}</div>
          ${timerHtml}
          <div class="code-display">${session.code}</div>
          <div class="qrcode-wrap"><div id="qrcode"></div></div>
          <div class="url-line">${url}</div>
          <p class="hint">Les participants scannent ce QR code ou saisissent le code sur ${window.location.origin}</p>
          <p class="hint">Cette session expirera automatiquement le ${formatExpiryDate(session)}.</p>
        </div>

        <div class="card">
          <div class="stack">
            <button id="startBtn" ${session.status === "voting" ? "disabled" : ""}>${startBtnText}</button>
            <button id="extendBtn" class="secondary" ${extendBtnDisabled}>Prolonger sans limite de temps</button>
            <button id="stopBtn" ${session.status === "voting" ? "" : "disabled"}>Arrêter les votes</button>
            <button id="resultsBtn" ${total === 0 ? "disabled" : ""}>Afficher les résultats des votes</button>
            <button id="newBtn" class="secondary">Nouveau vote (même session)</button>
          </div>
        </div>

        <div class="segmented-control" title="Basculer le mode d'affichage">
          <input type="radio" id="mode-org" name="display-mode" value="org" ${!presentationMode ? "checked" : ""}>
          <label for="mode-org">Organisateur</label>
          <input type="radio" id="mode-pres" name="display-mode" value="pres" ${presentationMode ? "checked" : ""}>
          <label for="mode-pres">Présentation</label>
          <div class="segment-slider"></div>
        </div>

        ${lowerContent}

        <div class="card">
          <button id="closeBtn" class="danger">Clôture de session</button>
          <p class="hint" style="margin-top:10px;">Ferme définitivement cette session et supprime tous ses votes de la base de données. Action irréversible.</p>
        </div>
      `;

      new QRCode(document.getElementById("qrcode"), {
        text: url,
        width: 220,
        height: 220,
        colorDark: "#1c2321",
        colorLight: "#ffffff",
      });

      document.getElementById("startBtn").onclick = startVoting;
      document.getElementById("extendBtn").onclick = prolongVoting;
      document.getElementById("stopBtn").onclick = () => updateStatus("stopped");
      document.getElementById("resultsBtn").onclick = () => updateStatus("results");
      document.getElementById("newBtn").onclick = resetSessionForNewItem;
      document.getElementById("closeBtn").onclick = closeSessionPermanently;
      document.getElementsByName("display-mode").forEach(radio => {
        radio.onchange = (event) => {
          presentationMode = (event.target.value === "pres");
          render();
        };
      });
    }


    function buildResultCard(counts, total, isPresentation, onlineCount) {
      let verdict = "Égalité";
      let verdictClass = "";
      if (counts.pour > counts.contre) { verdict = "Résultat : Pour"; verdictClass = "pour"; }
      else if (counts.contre > counts.pour) { verdict = "Résultat : Contre"; verdictClass = "contre"; }

      const onlineHtml = !isPresentation ? `<div class="turnout" style="margin-bottom:8px;">${onlineCount} connexion${onlineCount > 1 ? "s" : ""} en ce moment</div>` : "";

      return `
        <div class="card">
          <div class="verdict ${verdictClass}">${verdict}</div>
          ${onlineHtml}
          <div class="turnout">${total} votant${total > 1 ? "s" : ""}</div>
          <div class="tally">
            ${tallyRow("Pour", "pour", counts.pour, total)}
            ${tallyRow("Contre", "contre", counts.contre, total)}
            ${tallyRow("Abstention", "abst", counts.abstention, total)}
          </div>
        </div>
      `;
    }

    function getRemainingSeconds() {
      if (!countdownDeadline || timerProlonged) return 0;
      return Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000));
    }

    function clearVoteTimer() {
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = null;
      countdownDeadline = null;
      autoStopInProgress = false;
    }

    function beginVoteTimer(seconds = DEFAULT_VOTE_SECONDS) {
      if (countdownInterval) clearInterval(countdownInterval);
      timerProlonged = false;
      autoStopInProgress = false;
      countdownDuration = seconds * 1000;
      countdownDeadline = Date.now() + countdownDuration;
      countdownInterval = setInterval(async () => {
        const remainingMs = Math.max(0, countdownDeadline - Date.now());
        const timerBarFill = document.getElementById("timerBarFill");
        
        if (timerBarFill) {
          const pct = (remainingMs / countdownDuration) * 100;
          timerBarFill.style.width = pct + "%";
          if (remainingMs <= 3000) {
            timerBarFill.classList.add("warning");
          }
        }
        
        if (remainingMs <= 0 && session && session.status === "voting" && !timerProlonged && !autoStopInProgress) {
          autoStopInProgress = true;
          clearInterval(countdownInterval);
          countdownInterval = null;
          await updateStatus("stopped");
        }
      }, 50);
    }

    async function startVoting() {
      beginVoteTimer(DEFAULT_VOTE_SECONDS);
      const ok = await updateStatus("voting");
      if (!ok) { clearVoteTimer(); return; }
      if (presenceChannel) {
        await presenceChannel.send({
          type: "broadcast",
          event: "vote_timer",
          payload: { seconds: DEFAULT_VOTE_SECONDS }
        });
      }
      render();
    }

    async function prolongVoting() {
      if (!session || timerProlonged) return;
      if (session.status !== "voting") {
        const ok = await updateStatus("voting");
        if (!ok) return;
      }
      timerProlonged = true;
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = null;
      countdownDeadline = null;
      if (presenceChannel) {
        await presenceChannel.send({
          type: "broadcast",
          event: "vote_timer_prolonged",
          payload: {}
        });
      }
      render();
    }

    function tallyRow(label, cls, count, total) {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div class="label ${cls}">${label}</div>
        <div class="count">${count}</div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      `;
    }

    async function updateStatus(status) {
      const { error } = await sb.from("sessions").update({ status }).eq("id", session.id);
      if (error) { alert("Erreur : " + error.message); return false; }
      session.status = status;
      if (status !== "voting") {
        clearVoteTimer();
        timerProlonged = false;
      }
      render();
      return true;
    }

    async function closeSessionPermanently() {
      if (!confirm("Clôturer définitivement cette session ? Tous les votes seront supprimés et le lien ne fonctionnera plus. Cette action est irréversible.")) {
        return;
      }
      const closeBtn = document.getElementById("closeBtn");
      if (closeBtn) closeBtn.disabled = true;

      const { error: delVotesErr } = await sb.from("votes").delete().eq("session_id", session.id);
      if (delVotesErr) { alert("Erreur : " + delVotesErr.message); if (closeBtn) closeBtn.disabled = false; return; }

      const { error: delSessionErr } = await sb.from("sessions").delete().eq("id", session.id);
      if (delSessionErr) { alert("Erreur : " + delSessionErr.message); if (closeBtn) closeBtn.disabled = false; return; }

      if (resyncTimer) clearInterval(resyncTimer);
      clearVoteTimer();
      if (channel) sb.removeChannel(channel);
      if (presenceChannel) sb.removeChannel(presenceChannel);
      session = null;
      app.innerHTML = `<div class="card center hint">Cette session a été clôturée et ses données ont été supprimées. <a href="index.html">Démarrer une nouvelle session</a></div>`;
    }

    async function resetSessionForNewItem() {
      if (!confirm("Remettre les votes à zéro pour un nouvel objet, dans cette même session ? Les votes actuels seront définitivement supprimés.")) {
        return;
      }
      const newBtn = document.getElementById("newBtn");
      if (newBtn) newBtn.disabled = true;

      const { error: delErr } = await sb.from("votes").delete().eq("session_id", session.id);
      if (delErr) { alert("Erreur : " + delErr.message); if (newBtn) newBtn.disabled = false; return; }

      const { error: updErr } = await sb.from("sessions").update({ status: "idle" }).eq("id", session.id);
      if (updErr) { alert("Erreur : " + updErr.message); if (newBtn) newBtn.disabled = false; return; }

      session.status = "idle";
      votes = [];
      timerProlonged = false;
      clearVoteTimer();
      render();
    }

    // Le compteur affiché n'est jamais incrémenté "à la main" en JS : on relit
    // toujours l'ensemble des lignes réellement présentes en base (COUNT côté
    // source de vérité), pour rester correct même sous forte concurrence.
    async function resyncVotes() {
      const { data, error } = await sb.from("votes").select("choice").eq("session_id", session.id);
      if (!error) {
        votes = data || [];
        render();
      }
    }

    let channel = null;
    let presenceChannel = null;
    let resyncTimer = null;
    function subscribeRealtime() {
      if (channel) sb.removeChannel(channel);
      if (presenceChannel) sb.removeChannel(presenceChannel);
      if (resyncTimer) clearInterval(resyncTimer);
      // Le temps réel donne l'affichage instantané...
      channel = sb.channel("votes-host-" + session.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "votes", filter: `session_id=eq.${session.id}` }, () => {
          resyncVotes();
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` }, () => {
          // La session a été clôturée et supprimée automatiquement (15h écoulées).
          if (resyncTimer) clearInterval(resyncTimer);
          session = null;
          app.innerHTML = `<div class="card center hint">Cette session a été clôturée automatiquement (15h écoulées) et ses données ont été supprimées. <a href="index.html">Démarrer une nouvelle session</a></div>`;
        })
        .subscribe();
      // ...et un recomptage périodique sert de filet de sécurité si un
      // événement temps réel venait à être manqué pendant un pic de votes.
      resyncTimer = setInterval(resyncVotes, 4000);

      // Canal de présence : chaque votant sur vote.html "s'annonce" sur ce
      // même canal (session-<id>). On ne fait que l'écouter ici, sans s'y
      // annoncer soi-même, pour compter uniquement les participants connectés.
      presenceChannel = sb.channel("session-" + session.id, { config: { presence: {} } })
        .on("presence", { event: "sync" }, () => {
          onlineCount = Object.keys(presenceChannel.presenceState()).length;
          render();
        })
        .subscribe();
    }

    async function init() {
      if (!code || !secret) {
        app.innerHTML = `<div class="card center hint">Lien invalide. <a href="index.html">Démarrer une nouvelle session</a></div>`;
        return;
      }
      sb = getSupabaseClient();
      const { data, error } = await sb.from("sessions").select("*").eq("code", code).single();
      if (error || !data || data.host_secret !== secret) {
        app.innerHTML = `<div class="card center hint">Lien invalide ou expiré. <a href="index.html">Démarrer une nouvelle session</a></div>`;
        return;
      }
      session = data;
      const { data: existingVotes } = await sb.from("votes").select("choice").eq("session_id", session.id);
      votes = existingVotes || [];
      subscribeRealtime();
      render();
    }

    init();
