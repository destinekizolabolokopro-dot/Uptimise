// Uptimise · connecteur Supabase
// La page a été écrite pour la base de l'artefact claude.ai (window.claude.use("db") / use("user")).
// Ce fichier fournit exactement la même interface au-dessus de Supabase : la page tourne à l'identique,
// sur GitHub Pages ou n'importe quel hébergement, avec des comptes par e-mail et mot de passe.
// Configuration : window.UPTIMISE_SUPABASE = { url, anonKey } (la clé « anon » est publique par nature).
(() => {
  const cfg = window.UPTIMISE_SUPABASE;
  const sb = (window.UPTIMISE_SUPABASE_CLIENT || window.supabase.createClient)(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const nowIso = () => new Date().toISOString();
  const parentOf = (path) => path.split("/").slice(0, -1).join("/");
  const lastSeg = (path) => path.split("/").pop();
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  // Erreurs au format attendu par la page : un refus de droits devient « invalid_argument »
  const fail = (error) => {
    const denied = error && (error.code === "42501" || /row-level security|permission denied/i.test(error.message || ""));
    const notFound = error && (error.code === "P0002" || /not_found/.test(error.message || ""));
    const e = new Error((error && error.message) || "Erreur Supabase");
    e.code = denied ? "invalid_argument" : notFound ? "not_found" : "unavailable";
    return e;
  };

  // ------------------------------------------------------------------ Session
  let session = null;
  const ready = (async () => {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (session) {
      const u = session.user;
      const name = (u.user_metadata && u.user_metadata.name) || u.email.split("@")[0];
      await sb.from("people").upsert({ id: u.id, name }).then(() => {}, () => {});
      const { data: owner } = await sb.rpc("claim_first_owner");
      session.isOwner = owner === true;
    }
  })();
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
    if (event === "PASSWORD_RECOVERY") setTimeout(() => openAuth("nouveau"), 0);
  });

  // ------------------------------------------------------------------ Temps réel : une seule souscription
  const listeners = new Set();
  let channel = null;
  function watch(l) {
    listeners.add(l);
    if (!channel) {
      channel = sb.channel("docs-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (payload) => {
          const rec = payload.new && payload.new.path ? payload.new : payload.old || {};
          for (const x of listeners) if ((x.path && x.path === rec.path) || (x.col && (x.col === rec.parent))) x.poke();
        })
        .subscribe();
    }
    return () => listeners.delete(l);
  }
  // Filet de sécurité si le temps réel est coupé : nouvelle lecture toutes les 30 s
  setInterval(() => { for (const x of listeners) x.poke(); }, 30000);

  // ------------------------------------------------------------------ Documents
  const docSnap = (path, data) => ({ id: lastSeg(path), exists: data !== undefined, data: () => clone(data), metadata: {} });

  function doc(path) {
    return {
      id: lastSeg(path), path,
      async get() {
        const { data, error } = await sb.from("docs").select("data").eq("path", path).maybeSingle();
        if (error) throw fail(error);
        return docSnap(path, data ? data.data : undefined);
      },
      async set(value) {
        const { error } = await sb.from("docs").upsert({ path, parent: parentOf(path), data: clone(value), updated_at: nowIso() });
        if (error) throw fail(error);
      },
      async update(patch) {
        const { error } = await sb.rpc("doc_update", { p_path: path, p_patch: clone(patch) });
        if (error) throw fail(error);
      },
      async delete() {
        const { error } = await sb.from("docs").delete().eq("path", path);
        if (error) throw fail(error);
      },
      async acquire({ holder, ttlMs }) {
        const { data, error } = await sb.rpc("acquire_lease", { p_path: path, p_holder: holder, p_ttl_ms: ttlMs || 15000 });
        if (error) throw fail(error);
        return { acquired: data === true };
      },
      onSnapshot(next, onError) {
        let timer = null, alive = true;
        const load = () => this.get().then((s) => alive && next(s), (e) => onError && onError(e));
        const unwatch = watch({ path, poke: () => { clearTimeout(timer); timer = setTimeout(load, 120); } });
        load();
        return () => { alive = false; unwatch(); };
      },
      collection: (c) => query(path + "/" + c),
    };
  }

  function query(col, o = {}) {
    const ops = { "==": "eq", "!=": "neq", ">=": "gte", ">": "gt", "<=": "lte", "<": "lt" };
    async function run() {
      let q = sb.from("docs").select("path,data").eq("parent", col);
      for (const [f, op, v] of o.where || []) q = q[ops[op] || "eq"]("data->>" + f, v);
      if (o.order) q = q.order("data->>" + o.order[0], { ascending: o.order[1] !== "desc", nullsFirst: false });
      q = q.limit(o.limit || 1000);
      const { data, error } = await q;
      if (error) throw fail(error);
      const docs = data.map((r) => docSnap(r.path, r.data));
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} };
    }
    return {
      where: (f, op, v) => query(col, { ...o, where: [...(o.where || []), [f, op, v]] }),
      orderBy: (f, dir) => query(col, { ...o, order: [f, dir || "asc"] }),
      limit: (n) => query(col, { ...o, limit: n }),
      get: run,
      doc: (id) => doc(col + "/" + (id || crypto.randomUUID().replace(/-/g, "").slice(0, 20))),
      async add(data) { const r = doc(col + "/" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)); await r.set(data); return r; },
      onSnapshot(next, onError) {
        let timer = null, alive = true;
        const load = () => run().then((s) => alive && next(s), (e) => onError && onError(e));
        const unwatch = watch({ col, poke: () => { clearTimeout(timer); timer = setTimeout(load, 150); } });
        load();
        return () => { alive = false; unwatch(); };
      },
    };
  }
  const db = { doc, collection: (c) => query(c) };

  // ------------------------------------------------------------------ Personnes
  const avatar = (name, id) => {
    const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    const hue = [...(id || "")].reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0);
    return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="hsl(${hue},45%,42%)"/><text x="16" y="21" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">${initials}</text></svg>`);
  };
  const person = (id, name) => ({ id, name: name || "", avatarUrl: avatar(name, id), color: "#14298c", isMe: !!session && session.user.id === id, guest: false, email: null });
  const user = {
    async me() {
      if (!session) return { id: null, name: null, avatarUrl: "", isOwner: false, canEdit: false, email: null };
      const u = session.user, name = (u.user_metadata && u.user_metadata.name) || u.email.split("@")[0];
      return { ...person(u.id, name), email: u.email, isOwner: !!session.isOwner, canEdit: !!session.isOwner };
    },
    async id() { return session ? session.user.id : null; },
    async can() { return !!session; },
    async profiles(ids) {
      const list = [].concat(ids).filter(Boolean);
      const out = Object.fromEntries(list.map((i) => [i, person(i, "")]));
      if (!list.length) return out;
      const { data } = await sb.from("people").select("id,name").in("id", list);
      for (const p of data || []) out[p.id] = person(p.id, p.name);
      return out;
    },
    async search(q) {
      let r = sb.from("people").select("id,name").limit(20);
      if (q) r = r.ilike("name", `%${q}%`);
      const { data } = await r;
      return (data || []).map((p) => person(p.id, p.name));
    },
  };

  window.claude = { use: async (name) => { await ready; if (name === "db") return session ? db : null; if (name === "user") return user; return null; } };

  // ------------------------------------------------------------------ Numéros (chiffrés, lisibles par les membres validés)
  window.UPTIMISE_PHONES = async () => {
    await ready;
    if (!session) return null;
    const { data } = await sb.from("app_secrets").select("value").eq("name", "phones_key").maybeSingle();
    if (!data) return null; // pas encore membre validé, ou clé pas encore posée
    const res = await fetch("telephones.enc.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const box = await res.json();
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", b64(data.value), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.data));
    return JSON.parse(new TextDecoder().decode(plain));
  };

  // ------------------------------------------------------------------ Connexion : e-mail et mot de passe
  const css = `
  .ua-scrim{position:fixed;inset:0;background:var(--scrim,rgba(12,18,34,.45));z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
  .ua-box{background:var(--bg,#fff);color:var(--ink,#0c1222);border-radius:22px;padding:28px;width:min(440px,100%);display:flex;flex-direction:column;gap:14px;box-shadow:0 40px 80px -40px rgba(0,0,0,.5)}
  .ua-box h2{margin:0;font-weight:300;font-size:32px;letter-spacing:-.02em}
  .ua-box .ua-tabs{display:flex;gap:8px}
  .ua-box p{margin:0}
  .ua-box .btn-outline{width:100%}`;
  function openAuth(mode = "connexion") {
    if (!document.getElementById("ua-css")) { const s = document.createElement("style"); s.id = "ua-css"; s.textContent = css; document.head.append(s); }
    document.getElementById("ua-scrim")?.remove();
    const scrim = document.createElement("div"); scrim.id = "ua-scrim"; scrim.className = "ua-scrim";
    const titles = { connexion: "Se connecter", creation: "Créer mon compte", oubli: "Mot de passe oublié", nouveau: "Nouveau mot de passe" };
    const field = (id, label, type, extra = "") => `<div class="field"><label class="label" for="${id}">${label}</label><input id="${id}" class="input" type="${type}" ${extra} required></div>`;
    scrim.innerHTML = `<form class="ua-box" novalidate>
      <h2>${titles[mode]}</h2>
      ${mode === "connexion" || mode === "creation" ? `<div class="ua-tabs">
        <button class="chip small" type="button" data-mode="connexion" aria-pressed="${mode === "connexion"}">J’ai un compte</button>
        <button class="chip small" type="button" data-mode="creation" aria-pressed="${mode === "creation"}">Je crée mon compte</button></div>` : ""}
      ${mode === "creation" ? field("ua-name", "Prénom et nom", "text", 'autocomplete="name"') : ""}
      ${mode !== "nouveau" ? field("ua-email", "E-mail", "email", 'autocomplete="email"') : ""}
      ${mode !== "oubli" ? field("ua-pass", mode === "connexion" ? "Mot de passe" : "Mot de passe (8 caractères minimum)", "password", `autocomplete="${mode === "connexion" ? "current-password" : "new-password"}" minlength="8"`) : ""}
      <div class="alert" role="alert" hidden></div>
      <p class="okmsg" role="status" hidden></p>
      <button class="btn" type="submit">${mode === "creation" ? "Créer mon compte" : mode === "oubli" ? "Recevoir le lien" : mode === "nouveau" ? "Enregistrer" : "Se connecter"}</button>
      ${mode === "connexion" ? `<button class="btn-outline" type="button" data-mode="oubli">Mot de passe oublié ?</button>` : ""}
      ${mode === "oubli" ? `<p class="hint">Tu reçois un lien par e-mail (regarde aussi les courriers indésirables). Il te ramène ici pour choisir un nouveau mot de passe.</p>
        <button class="btn-outline" type="button" data-mode="connexion">← Retour à la connexion</button>` : ""}
      <button class="link" type="button" data-close style="align-self:flex-start">Annuler</button>
    </form>`;
    document.body.append(scrim);
    const form = scrim.querySelector("form"), alertEl = scrim.querySelector(".alert"), ok = scrim.querySelector(".okmsg");
    const val = (id) => (scrim.querySelector("#" + id) || {}).value?.trim() || "";
    scrim.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => openAuth(b.dataset.mode)));
    scrim.querySelector("[data-close]").addEventListener("click", () => scrim.remove());
    scrim.addEventListener("click", (e) => { if (e.target === scrim) scrim.remove(); });
    const say = (msg) => { alertEl.hidden = false; alertEl.textContent = msg; };
    const FR = { "Invalid login credentials": "E-mail ou mot de passe incorrect.", "User already registered": "Un compte existe déjà avec cet e-mail : choisis « J’ai un compte ».", "Email not confirmed": "Confirme d’abord ton e-mail avec le lien reçu." };
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); alertEl.hidden = true;
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        let r;
        if (mode === "creation") {
          if (!val("ua-name")) throw new Error("Indique ton prénom et ton nom.");
          r = await sb.auth.signUp({ email: val("ua-email"), password: val("ua-pass"), options: { data: { name: val("ua-name") } } });
          if (!r.error && !r.data.session) { ok.hidden = false; ok.textContent = "Compte créé. Ouvre le lien reçu par e-mail pour le confirmer, puis connecte-toi."; btn.disabled = false; return; }
        } else if (mode === "connexion") r = await sb.auth.signInWithPassword({ email: val("ua-email"), password: val("ua-pass") });
        else if (mode === "oubli") {
          r = await sb.auth.resetPasswordForEmail(val("ua-email"), { redirectTo: location.origin + location.pathname });
          if (!r.error) { ok.hidden = false; ok.textContent = "C’est envoyé : si un compte existe avec cet e-mail, tu vas recevoir un lien. Ouvre-le depuis ce même appareil."; btn.disabled = false; return; }
        } else r = await sb.auth.updateUser({ password: val("ua-pass") });
        if (r.error) throw new Error(FR[r.error.message] || r.error.message);
        // Connecté : on recharge la page sur le choix de l'espace (la porte choisie s'ouvre toute seule)
        location.hash = "connexion"; location.reload();
      } catch (err) { say(err.message || "Une erreur est survenue. Réessaie."); btn.disabled = false; }
    });
    scrim.querySelector("input")?.focus();
  }

  window.UPTIMISE_AUTH = {
    open: (door) => { try { if (door) sessionStorage.setItem("uptimise-porte", door); } catch (e) {} openAuth("connexion"); },
    logout: async () => { try { localStorage.removeItem("uptimise-espace"); } catch (e) {} await sb.auth.signOut(); location.hash = ""; location.reload(); },
    pendingDoor: () => { try { const d = sessionStorage.getItem("uptimise-porte"); sessionStorage.removeItem("uptimise-porte"); return d; } catch (e) { return null; } },
    signedIn: async () => { await ready; return !!session; },
  };
})();
