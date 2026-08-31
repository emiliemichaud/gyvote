    document.getElementById("createBtn").addEventListener("click", async () => {
      const btn = document.getElementById("createBtn");
      const err = document.getElementById("err");
      btn.disabled = true;
      err.style.display = "none";
      try {
        const sb = getSupabaseClient();
        const code = generateSessionCode();
        const { data, error } = await sb
          .from("sessions")
          .insert({ code })
          .select("id, code, host_secret")
          .single();
        if (error) throw error;
        const url = new URL("host.html", window.location.href);
        url.searchParams.set("s", data.code);
        url.searchParams.set("t", data.host_secret);
        window.location.href = url.toString();
      } catch (e) {
        err.textContent = "Erreur : " + e.message;
        err.style.display = "block";
        btn.disabled = false;
      }
    });
    document.getElementById("joinBtn").addEventListener("click", () => {
      const joinErr = document.getElementById("joinErr");
      const code = document.getElementById("joinCode").value.trim().toUpperCase();
      joinErr.style.display = "none";
      if (!code) {
        joinErr.textContent = "Saisis d'abord un code de session.";
        joinErr.style.display = "block";
        return;
      }
      window.location.href = voteUrlForCode(code);
    });

    document.getElementById("joinCode").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("joinBtn").click();
    });
