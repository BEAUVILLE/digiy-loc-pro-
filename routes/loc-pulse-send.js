// routes/locPulseSend.js
import express from "express";

const router = express.Router();

// -------------------------
// CONFIG
// -------------------------
const SEND_API_KEY = process.env.SEND_API_KEY || ""; // même clé que ton worker
const DEFAULT_SMS_SENDER = process.env.SMS_SENDER || "DIGIY";

// -------------------------
// HELPERS
// -------------------------
function isAuthed(req) {
  const key1 = req.headers["x-api-key"];
  const auth = req.headers["authorization"] || "";
  const key2 = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return SEND_API_KEY && (key1 === SEND_API_KEY || key2 === SEND_API_KEY);
}

function normPhone(p) {
  // garde simple: +221XXXXXXXXX
  return String(p || "").trim();
}

function pickText(payload, fallback = "") {
  if (!payload) return fallback;
  return payload.msg || payload.text || fallback;
}

// -------------------------
// PROVIDER STUBS (à brancher)
// -------------------------
async function sendWhatsApp({ to, text, meta }) {
  // TODO: brancher ton provider WhatsApp (Cloud API / Gateway / autre)
  // Retourne { ok: true } si succès, { ok:false, error:"..." } sinon
  console.log("[WA] to=", to, "text=", text, "meta=", meta);
  return { ok: true };
}

async function sendSMS({ to, text, meta }) {
  // TODO: brancher ton provider SMS (Orange/Free/Sendbox/Twilio/etc.)
  console.log("[SMS] to=", to, "text=", text, "meta=", meta);
  return { ok: true };
}

async function sendPush({ to, title, body, meta }) {
  // TODO: brancher Web Push/PWA (si tu as déjà)
  console.log("[PUSH] to=", to, "title=", title, "body=", body, "meta=", meta);
  return { ok: true };
}

// -------------------------
// ROUTE
// -------------------------
router.post("/loc/pulse/send", express.json({ limit: "256kb" }), async (req, res) => {
  try {
    if (!isAuthed(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const {
      outbox_id,
      reservation_id,
      phone,
      business_code,
      pulse_kind,
      channel,     // 'whatsapp'/'sms' (input worker) — mais nous on route
      payload,     // json
      worker_id,
    } = req.body || {};

    const to = normPhone(phone);
    if (!to) return res.status(400).json({ ok: false, error: "missing phone" });

    const text = pickText(payload, `DIGIY LOC: ${pulse_kind || "pulse"}`);
    const priority = payload?.priority || "normal";
    const whatsapp_optin = !!payload?.whatsapp_optin; // clé terrain
    const pwa_optin = !!payload?.pwa_optin;

    // meta utile pour logs/providers
    const meta = {
      outbox_id,
      reservation_id,
      business_code,
      pulse_kind,
      worker_id,
      priority,
    };

    // 1) Push en bonus (non bloquant)
    if (pwa_optin) {
      sendPush({
        to,
        title: "DIGIY LOC",
        body: text,
        meta,
      }).catch(() => {});
    }

    // 2) Routage principal
    // - WhatsApp seulement si opt-in
    // - sinon SMS
    // - fallback: si WA échoue -> SMS
    if (whatsapp_optin) {
      const wa = await sendWhatsApp({ to, text, meta });
      if (wa.ok) return res.json({ ok: true, channel_used: "whatsapp" });

      // fallback SMS
      const sms = await sendSMS({ to, text, meta });
      if (sms.ok) return res.json({ ok: true, channel_used: "sms", fallback_from: "whatsapp" });

      return res.status(502).json({ ok: false, error: "wa_failed_and_sms_failed", detail: wa.error || "unknown" });
    }

    // Sans opt-in => SMS direct
    const sms = await sendSMS({ to, text, meta });
    if (sms.ok) return res.json({ ok: true, channel_used: "sms" });

    return res.status(502).json({ ok: false, error: "sms_failed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "server_error" });
  }
});

export default router;
