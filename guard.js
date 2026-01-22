/* =========================
   DIGIY LOC PRO — GUARD SIMPLIFIÉ
   Slug + PIN → owner_id → Session 8h
========================= */
(function () {
  "use strict";

  // =============================
  // SUPABASE
  // =============================
  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const SESSION_KEY = "DIGIY_LOC_PRO_SESSION";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

  function now() { return Date.now(); }

  // =============================
  // SESSION
  // =============================
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const s = JSON.parse(raw);
      if (!s || !s.expires_at || now() > s.expires_at) return null;
      return s;
    } catch {
      return null;
    }
  }

  function setSession(data) {
    const session = {
      ...data,
      created_at: now(),
      expires_at: now() + SESSION_TTL_MS
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // =============================
  // SUPABASE
  // =============================
  function getSb() {
    if (!window.supabase?.createClient) return null;
    if (!window.__digiy_sb__) {
      window.__digiy_sb__ = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.__digiy_sb__;
  }

  // =============================
  // LOGIN AVEC SLUG + PIN
  // =============================
  async function loginWithPin(slug, pin) {
    const sb = getSb();
    if (!sb) return { ok: false, error: "Supabase non initialisé" };

    slug = (slug || "").trim();
    pin = (pin || "").trim();

    if (!slug || !pin) return { ok: false, error: "Slug et PIN requis" };

    // ✅ Appel RPC verify_access_pin(slug, pin)
    const { data, error } = await sb.rpc("verify_access_pin", {
      p_slug: slug,
      p_pin: pin
    });

    if (error) return { ok: false, error: error.message };

    // Parse si string JSON
    const result = typeof data === "string" ? JSON.parse(data) : data;

    if (!result?.ok || !result?.owner_id) {
      return { ok: false, error: result?.error || "PIN invalide" };
    }

    // ✅ STOCKER owner_id + infos en session
    const session = setSession({
      ok: true,
      owner_id: result.owner_id,
      slug: result.slug,
      title: result.title,
      phone: result.phone
    });

    return { ok: true, session };
  }

  // =============================
  // PROTECTION DE PAGE
  // =============================
  function requireSession(redirect = "pin.html") {
    const s = getSession();
    if (!s || !s.owner_id) {
      location.replace(redirect);
      return null;
    }
    return s;
  }

  // =============================
  // BOOT (pour app.html)
  // =============================
  async function boot(options) {
    const redirect = options?.login || "pin.html";
    const s = requireSession(redirect);
    
    if (!s) return { ok: false };
    
    return { 
      ok: true, 
      session: s 
    };
  }

  // =============================
  // LOGOUT
  // =============================
  function logout(redirect = "index.html") {
    clearSession();
    location.replace(redirect);
  }

  // =============================
  // EXPORT
  // =============================
  window.DIGIY_GUARD = {
    boot,
    loginWithPin,
    requireSession,
    logout,
    getSession,
    getSb
  };

})();
/* =========================
   DIGIY GUARD — SLUG SOURCE OF TRUTH (PATCH)
   Objectif:
   - Slug priorité: URL > session > localStorage
   - Si URL.slug existe => synchronise localStorage (anti "slug fantôme")
   - withSlug() injecte toujours le bon slug
========================= */

(function(){
  "use strict";

  // --- storage keys (stables) ---
  const K = {
    SLUG: "DIGIY_SLUG",
    PRO_ID: "DIGIY_PRO_ID",     // si chez toi c'est owner_id, ok; sinon adapte
    TITLE: "DIGIY_TITLE",
    PHONE: "DIGIY_PHONE",
    SESSION: "DIGIY_LOC_PRO_SESSION_V1" // adapte si ton guard utilise un autre nom
  };

  // --- safe localStorage ---
  function lsGet(k){
    try{ return localStorage.getItem(k); }catch(_){ return null; }
  }
  function lsSet(k,v){
    try{ localStorage.setItem(k, String(v ?? "")); }catch(_){}
  }

  // --- read slug from URL (strict) ---
  function urlSlug(){
    try{
      const s = new URLSearchParams(location.search).get("slug");
      return (s || "").trim();
    }catch(_){
      return "";
    }
  }

  // --- normalize slug safely (optional but recommended) ---
  function cleanSlug(s){
    const x = String(s || "").trim();
    if(!x) return "";
    return x
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")   // enlève accents
      .replace(/[^a-z0-9\-_]/g,"")                      // garde safe
      .replace(/-+/g,"-")
      .replace(/^_+|_+$/g,"");
  }

  // --- get current session object from guard (if exists) ---
  // Si ton guard expose déjà getSession(), on l'utilise.
  function safeSession(){
    try{
      const s = window.DIGIY_GUARD?.getSession?.();
      return s && typeof s === "object" ? s : null;
    }catch(_){
      return null;
    }
  }

  // ✅ SOURCE OF TRUTH
  function getSlug(){
    const u = cleanSlug(urlSlug());
    if(u) return u;

    const sess = safeSession();
    const ss = cleanSlug(sess?.slug || "");
    if(ss) return ss;

    return cleanSlug(lsGet(K.SLUG) || "");
  }

  // ✅ Sync localStorage ONLY when URL gives slug (authoritative)
  function syncSlugFromUrl(){
    const u = cleanSlug(urlSlug());
    if(!u) return null;
    const cur = cleanSlug(lsGet(K.SLUG) || "");
    if(cur !== u) lsSet(K.SLUG, u);
    return u;
  }

  // ✅ Inject slug into urls
  function withSlug(url){
    const s = getSlug();
    try{
      const u = new URL(url, location.href);
      if(s) u.searchParams.set("slug", s);
      return u.toString();
    }catch(_){
      // fallback simple
      if(!s) return url;
      return url + (url.includes("?") ? "&" : "?") + "slug=" + encodeURIComponent(s);
    }
  }

  // ✅ Convenience: redirect safe
  function go(url){
    location.replace(withSlug(url));
  }

  // --- Attach to guard (non destructif) ---
  window.DIGIY_GUARD = window.DIGIY_GUARD || {};
  window.DIGIY_GUARD.getSlug = getSlug;
  window.DIGIY_GUARD.withSlug = withSlug;
  window.DIGIY_GUARD.go = go;
  window.DIGIY_GUARD.syncSlugFromUrl = syncSlugFromUrl;

  // 🔥 Execute sync ASAP when script loads
  // (Résout ton cas: URL=chez-astou-boutique, LS=chez-astou-saly)
  syncSlugFromUrl();

})();
