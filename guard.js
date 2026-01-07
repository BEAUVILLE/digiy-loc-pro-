/* =========================
   DIGIY GUARD — UNIVERSAL (GitHub Pages safe)
========================= */
(function(){
  "use strict";

  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  function getBase(){
    const path = location.pathname || "/";
    const parts = path.split("/").filter(Boolean);
    return (parts.length >= 1) ? ("/" + parts[0]) : "";
  }

  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if(p.startsWith("00221")) p = "+221" + p.slice(5);
    if(!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if(!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function getPhone(){
    const s = sessionStorage.getItem("digiy_phone") || sessionStorage.getItem("digiy_driver_phone");
    if (s) return s;

    try{
      const a = JSON.parse(localStorage.getItem("digiy_access_pin")||"null");
      if(a?.phone) return a.phone;
    }catch(_){}

    try{
      const b = JSON.parse(localStorage.getItem("digiy_driver_access_pin")||"null");
      if(b?.phone) return b.phone;
    }catch(_){}

    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem("digiy_phone", p);
    sessionStorage.setItem("digiy_driver_phone", p);
    try{
      localStorage.setItem("digiy_access_pin", JSON.stringify({ phone: p }));
      localStorage.setItem("digiy_driver_access_pin", JSON.stringify({ phone: p }));
    }catch(_){}
    return p;
  }

  function getSB(){
    if(window.__sb) return window.__sb;
    if(!window.supabase?.createClient) throw new Error("Supabase JS not loaded");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  async function isActive(phone, module){
    const supabase = getSB();
    const { data, error } = await supabase.rpc("is_module_active", {
      p_phone: phone,
      p_module: module
    });
    if(error) throw error;
    return !!data;
  }

  function go(url){ location.replace(url); }

  async function boot(cfg){
    const BASE = getBase();
    const module = cfg.module;                 // "loc"
    const dashboard = cfg.dashboard;           // BASE + "/planning.html"
    const login = cfg.login;                   // BASE + "/authentification-loc.html"
    const pay = cfg.pay || "https://beauville.github.io/commencer-a-payer/";

    const phone = getPhone();
    if(!phone){
      go(login);
      return;
    }

    try{
      const ok = await isActive(phone, module);
      if(!ok){
        const from = location.href;
        go(pay + "?module=" + encodeURIComponent(module)
          + "&phone=" + encodeURIComponent(phone)
          + "&from=" + encodeURIComponent(from));
        return;
      }
      go(dashboard);
    }catch(e){
      console.warn("GUARD error (fallback allow):", e);
      go(dashboard);
    }
  }

  window.DIGIY_GUARD = { boot, getPhone, setPhone, normPhone };
})();
