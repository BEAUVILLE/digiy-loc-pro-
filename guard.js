/* =========================
   DIGIY LOC GUARD — PHONE+PIN + SESSION TOKEN
   - No email, no auth UI
   - Requires a short-lived session token issued by Supabase RPC
   - If no session -> login
   - If subscription inactive -> pay
========================= */
(function(){
  "use strict";

  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const KEY = {
    phone: "digiy_phone",
    sess:  "digiy_loc_session" // { phone, token, exp }
  };

  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if(p.startsWith("00221")) p = "+221" + p.slice(5);
    if(!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if(!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function getSB(){
    if(window.__sb) return window.__sb;
    if(!window.supabase?.createClient) throw new Error("Supabase JS not loaded");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  function getPhone(){
    const s = sessionStorage.getItem(KEY.phone);
    if(s) return s;
    try{
      const sess = JSON.parse(localStorage.getItem(KEY.sess)||"null");
      if(sess?.phone) return sess.phone;
    }catch(_){}
    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem(KEY.phone, p);
    return p;
  }

  function getSession(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY.sess)||"null");
      if(!s?.token || !s?.phone || !s?.exp) return null;
      if(Date.now() > Number(s.exp)) return null;
      return s;
    }catch(_){ return null; }
  }

  function setSession({ phone, token, exp_ms }){
    const obj = { phone: normPhone(phone), token: String(token), exp: Date.now() + Number(exp_ms||0) };
    localStorage.setItem(KEY.sess, JSON.stringify(obj));
    setPhone(obj.phone);
    return obj;
  }

  function clearSession(){
    try{ localStorage.removeItem(KEY.sess); }catch(_){}
    try{ sessionStorage.removeItem(KEY.phone); }catch(_){}
  }

  async function isActive(phone, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("is_module_active", { p_phone: phone, p_module: module });
    if(error) throw error;
    return !!data;
  }

  async function validateSession(){
    const sb = getSB();
    const sess = getSession();
    if(!sess) return false;
    const { data, error } = await sb.rpc("digiy_loc_session_validate", {
      p_phone: sess.phone,
      p_token: sess.token
    });
    if(error) return false;
    return !!data;
  }

  function go(url){ location.replace(url); }

  async function boot(cfg){
    const module = String(cfg.module || "LOC").trim();
    const dashboard = cfg.dashboard || "./planning.html";
    const login = cfg.login || "./login.html";
    const pay = cfg.pay || "https://beauville.github.io/commencer-a-payer/";

    const phoneRaw = getPhone();
    if(!phoneRaw){ go(login); return; }
    const phone = setPhone(phoneRaw);

    // 1) session required
    const okSession = await validateSession().catch(()=>false);
    if(!okSession){ clearSession(); go(login); return; }

    // 2) subscription
    const ok = await isActive(phone, module).catch(()=>false);
    if(!ok){
      const from = location.href;
      go(pay + "?module=" + encodeURIComponent(module)
        + "&phone=" + encodeURIComponent(phone)
        + "&from=" + encodeURIComponent(from));
      return;
    }

    // 3) go dashboard if not already
    const dashName = String(dashboard).split("/").pop();
    if(dashName && location.pathname.endsWith(dashName)) return;
    go(dashboard);
  }

  window.DIGIY_GUARD = { boot, getPhone, setPhone, setSession, getSession, clearSession, normPhone };
})();
