/* =========================
   DIGIY LOC PRO — GUARD FINAL (FLUIDE)
   - Login PIN (RPC: verify_access_pin)
   - OwnerID via RPC: loc_verify_pin_and_get_owner_id
   - Session locale 8h (pas de re-saisie tel/pin)
   - Slug persisté + propagé
   - Abonnement check optional (is_module_active)
   - Logout simple (1 bouton)
   - GitHub Pages safe (liens relatifs)
========================= */
(function(){
  "use strict";

  // =============================
  // SUPABASE
  // =============================
  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const KEY = {
    phone: "digiy_phone",
    slug:  "digiy_loc_slug",
    sess:  "digiy_loc_pro_session_v2", // { phone, owner_id, ok, exp }
    subs:  "digiy_loc_subs_cache_v1"   // { "<phone>|<module>": { ok, exp } }
  };

  const DEFAULTS = {
    module: "loc",                     // ✅ minuscule (ton PIN est en "loc")
    login: "./pin.html",
    dashboard: "./index.html",          // ✅ index = cockpit
    pay: "https://beauville.github.io/commencer-a-payer/",
    diagnostic: "./health-loc.html",
    requireSlug: true,
    checkSubscription: true,
    subsCacheMs: 5 * 60 * 1000,         // 5 min
    sessionMs: 8 * 60 * 60 * 1000       // 8h
  };

  // =============================
  // Helpers URL / SLUG
  // =============================
  function qs(name){
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch(_){ return ""; }
  }

  function getSlug(){
    const s = String(qs("slug") || "").trim();
    if (s) { try { localStorage.setItem(KEY.slug, s); } catch(_){} return s; }
    try { return String(localStorage.getItem(KEY.slug) || "").trim(); } catch(_){}
    return "";
  }

  function withSlug(url){
    const slug = getSlug();
    if (!slug) return url;

    const isAbs = /^https?:\/\//i.test(String(url));
    try{
      const u = new URL(String(url), location.href);
      if (!u.searchParams.get("slug")) u.searchParams.set("slug", slug);

      if (isAbs) return u.toString();
      return u.pathname + u.search + u.hash;
    }catch(_){
      const sep = String(url).includes("?") ? "&" : "?";
      return String(url) + sep + "slug=" + encodeURIComponent(slug);
    }
  }

  function go(url){
    location.replace(withSlug(url));
  }

  function currentFile(){
    try{
      const p = location.pathname.split("/").filter(Boolean);
      return p.length ? p[p.length - 1] : "";
    }catch(_){
      return "";
    }
  }

  // =============================
  // Phone / Session
  // =============================
  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if (p.startsWith("00221")) p = "+221" + p.slice(5);
    if (!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if (!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function getSB(){
    if (window.__sb) return window.__sb;
    if (!window.supabase?.createClient) throw new Error("Supabase JS not loaded (include supabase-js before guard.js)");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  function getPhone(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY.sess) || "null");
      if (s?.phone) return s.phone;
    }catch(_){}
    const ss = sessionStorage.getItem(KEY.phone);
    if (ss) return ss;
    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem(KEY.phone, p);
    return p;
  }

  function getSession(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY.sess) || "null");
      if (!s?.phone) return null;
      if (s?.exp && Date.now() > Number(s.exp)) return null;
      return s;
    }catch(_){
      return null;
    }
  }

  function setSession({ phone, owner_id }, sessionMs){
    const p = normPhone(phone);
    const exp = Date.now() + Number(sessionMs || DEFAULTS.sessionMs);
    const sess = { ok:true, phone:p, owner_id: owner_id ? String(owner_id) : null, exp };
    localStorage.setItem(KEY.sess, JSON.stringify(sess));
    setPhone(p);
    return sess;
  }

  function clearSession(){
    try{ localStorage.removeItem(KEY.sess); }catch(_){}
    try{ sessionStorage.removeItem(KEY.phone); }catch(_){}
  }

  function sessionLooksValid(){
    const s = getSession();
    if (!s?.phone) return false;
    if (s.exp && Date.now() > Number(s.exp)) return false;
    return true;
  }

  // =============================
  // Subs cache
  // =============================
  function readSubsCache(){
    try { return JSON.parse(localStorage.getItem(KEY.subs) || "{}") || {}; }
    catch(_){ return {}; }
  }
  function writeSubsCache(cache){
    try { localStorage.setItem(KEY.subs, JSON.stringify(cache || {})); } catch(_){}
  }
  function subsCacheKey(phone, module){
    return String(phone || "") + "|" + String(module || "");
  }
  function getCachedSub(phone, module){
    const cache = readSubsCache();
    const k = subsCacheKey(phone, module);
    const v = cache[k];
    if (!v) return null;
    if (v.exp && Date.now() > Number(v.exp)) return null;
    return !!v.ok;
  }
  function setCachedSub(phone, module, ok, ttlMs){
    const cache = readSubsCache();
    const k = subsCacheKey(phone, module);
    cache[k] = { ok: !!ok, exp: Date.now() + Number(ttlMs || DEFAULTS.subsCacheMs) };
    writeSubsCache(cache);
  }

  // =============================
  // RPC
  // =============================
  async function rpcVerifyAccessPin(phone, pin, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("verify_access_pin", {
      p_phone: phone, p_pin: pin, p_module: module
    });
    if (error) throw error;
    return data;
  }

  async function rpcGetOwnerIdFromPin(phone, pin, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("loc_verify_pin_and_get_owner_id", {
      p_phone: phone, p_pin: pin, p_module: module
    });
    if (error) throw error;
    return data;
  }

  async function rpcIsModuleActive(phone, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("is_module_active", {
      p_phone: phone, p_module: module
    });
    if (error) throw error;
    return !!data;
  }

  function redirectToPay(pay, module, phone, slug){
    const from = location.href;
    location.replace(
      pay
      + "?module=" + encodeURIComponent(module)
      + "&phone=" + encodeURIComponent(phone)
      + "&from=" + encodeURIComponent(from)
      + (slug ? "&slug=" + encodeURIComponent(slug) : "")
      + "&status=pending"
    );
  }

  // =============================
  // PUBLIC API
  // =============================
  async function boot(cfg){
    cfg = cfg || {};

    const module = String(cfg.module || DEFAULTS.module).trim().toLowerCase();
    const login = cfg.login || DEFAULTS.login;
    const dashboard = cfg.dashboard || DEFAULTS.dashboard;
    const pay = cfg.pay || DEFAULTS.pay;

    const requireSlug = (cfg.requireSlug !== false) && DEFAULTS.requireSlug;
    const checkSubscription = (cfg.checkSubscription !== false) && DEFAULTS.checkSubscription;
    const subsCacheMs = Number(cfg.subsCacheMs || DEFAULTS.subsCacheMs);

    // pages où on ne force pas redirect
    const file = currentFile();
    const allow = ["pin.html","login.html","create-pin.html"].includes(file);

    const slug = getSlug();
    if (requireSlug && !slug && !allow) { go(login); return; }

    const sess = getSession();
    if (!sess?.phone || !sessionLooksValid()){
      clearSession();
      if (!allow) go(login);
      return;
    }

    const phone = setPhone(sess.phone);

    if (checkSubscription){
      const cached = getCachedSub(phone, module);
      if (cached === false){
        redirectToPay(pay, module, phone, slug);
        return;
      }
      if (cached === null){
        try{
          const ok = await rpcIsModuleActive(phone, module);
          setCachedSub(phone, module, ok, subsCacheMs);
          if (!ok){
            redirectToPay(pay, module, phone, slug);
            return;
          }
        }catch(e){
          console.warn("is_module_active error:", e);
          clearSession();
          if (!allow) go(login);
          return;
        }
      }
    }

    // si on est sur pin/login → et session ok → go cockpit
    if (allow){
      go(dashboard);
      return;
    }

    // sinon: on laisse l'utilisateur sur la page demandée (pas d'auto-redirect)
    return;
  }

  async function loginWithPin(phone, pin, module){
    const p = setPhone(phone);
    const mod = String(module || DEFAULTS.module).trim().toLowerCase();

    // 1) vérif pin (fonction existante)
    const res = await rpcVerifyAccessPin(p, String(pin||""), mod);

    const ok =
      (res === true) ||
      (res && typeof res === "object" && (res.ok === true || res.allowed === true || res.valid === true));

    if (!ok) return { ok:false, res };

    // 2) récup owner_id (ton nouveau RPC)
    const o = await rpcGetOwnerIdFromPin(p, String(pin||""), mod);

    if (!o || o.ok !== true || !o.owner_id){
      return { ok:false, res: o || { ok:false, reason:"NO_OWNER" } };
    }

    setSession({ phone: p, owner_id: o.owner_id }, DEFAULTS.sessionMs);
    setCachedSub(p, mod, true, 30 * 1000);

    return { ok:true, owner_id: o.owner_id, res };
  }

  function logout(redirect){
    clearSession();
    const slug = getSlug();
    if (redirect) go(redirect);
    else go(DEFAULTS.login + (slug ? ("?slug=" + encodeURIComponent(slug)) : ""));
  }

  const API = {
    boot,
    loginWithPin,
    logout,
    getPhone,
    getSession,
    setSession,
    clearSession,
    normPhone,
    getSlug,
    withSlug
  };

  window.DIGIY_LOC_PRO_GUARD = API;
  window.DIGIY_GUARD = API;
})();
