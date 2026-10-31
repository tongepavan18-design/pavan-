require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

// CORS: allow your GitHub Pages site to call this backend
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://tongepavan18-design.github.io";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Simple rate limit: max 20 requests per minute per IP
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (list.length >= 20) return res.status(429).json({ error: "Too many requests" });
  list.push(now);
  hits.set(req.ip, list);
  next();
}

function clean(num) {
  let d = String(num || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

const TG = () => process.env.TELEGRAM_BOT_TOKEN;
async function tg(method, body) {
  if (!TG()) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const r = await fetch(`https://api.telegram.org/bot${TG()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(d.description || `Telegram error ${r.status}`);
  return d.result;
}

// FREE WhatsApp via CallMeBot (each contact must activate once: callmebot.com/blog/free-api-whatsapp-messages)
async function sendCallMeBot(phone10, apikey, text) {
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=%2B91${phone10}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok) throw new Error(`CallMeBot ${r.status}: ${t.slice(0, 120)}`);
  return t;
}

// OPTIONAL paid SMS via Fast2SMS (only used if FAST2SMS_API_KEY is set)
async function sendFast2Sms(numbers, message) {
  const r = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: { authorization: process.env.FAST2SMS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ route: "q", message, numbers: numbers.join(",") }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.return === false) throw new Error(d.message || `Fast2SMS error ${r.status}`);
}

// List people who pressed Start on your bot, so you can pick their chat id
app.get("/api/telegram/chats", rateLimit, async (req, res) => {
  try {
    if (!TG()) throw new Error("TELEGRAM_BOT_TOKEN missing");
    const r = await fetch(`https://api.telegram.org/bot${TG()}/getUpdates`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.description || "Telegram error");
    const seen = new Map();
    for (const u of d.result) {
      const c = u.message?.chat;
      if (c && c.type === "private") {
        seen.set(String(c.id), { chatId: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "User" });
      }
    }
    res.json({ chats: [...seen.values()] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/sos", rateLimit, async (req, res) => {
  const { contacts, lat, lng, accuracy, note } = req.body || {};
  const list = (Array.isArray(contacts) ? contacts : []).slice(0, 10).map((c) => ({
    name: String(c.name || "Contact").slice(0, 40),
    phone: clean(c.phone),
    telegramChatId: c.telegramChatId ? String(c.telegramChatId) : "",
    callmebotKey: c.callmebotKey ? String(c.callmebotKey) : "",
  }));
  if (!list.length) return res.status(400).json({ error: "No contacts" });
  if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "Location missing" });

  const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const link = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  const message =
    `EMERGENCY. I need help.\n` +
    (note ? `${String(note).slice(0, 120)}\n` : "") +
    `My live location: ${link}\n` +
    (accuracy ? `Accuracy: ~${Math.round(accuracy)} m\n` : "") +
    `Time: ${time}\nPlease contact me or call the police on 112.`;

  const out = { message, telegram: [], whatsapp: [], sms: { skipped: true } };

  await Promise.all(
    list.map(async (c) => {
      // Telegram: text + live location
      if (c.telegramChatId) {
        try {
          await tg("sendMessage", { chat_id: c.telegramChatId, text: message });
          const loc = await tg("sendLocation", {
            chat_id: c.telegramChatId, latitude: lat, longitude: lng,
            live_period: 3600, horizontal_accuracy: Math.min(1500, accuracy || 0) || undefined,
          });
          out.telegram.push({ name: c.name, ok: true, chatId: c.telegramChatId, messageId: loc.message_id });
        } catch (e) {
          out.telegram.push({ name: c.name, ok: false, error: e.message });
        }
      }
      // WhatsApp (CallMeBot)
      if (c.phone && c.callmebotKey) {
        try {
          await sendCallMeBot(c.phone, c.callmebotKey, message);
          out.whatsapp.push({ name: c.name, ok: true });
        } catch (e) {
          out.whatsapp.push({ name: c.name, ok: false, error: e.message });
        }
      }
    })
  );

  // Optional paid SMS
  if (process.env.FAST2SMS_API_KEY) {
    try {
      await sendFast2Sms([...new Set(list.map((c) => c.phone).filter(Boolean))], message);
      out.sms = { ok: true };
    } catch (e) {
      out.sms = { ok: false, error: e.message };
    }
  }

  res.json(out);
});

// Keep Telegram live location moving
app.post("/api/update", rateLimit, async (req, res) => {
  const { targets, lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number" || !Array.isArray(targets)) {
    return res.status(400).json({ error: "Bad request" });
  }
  const results = await Promise.all(
    targets.slice(0, 10).map(async (t) => {
      try {
        await tg("editMessageLiveLocation", {
          chat_id: String(t.chatId), message_id: Number(t.messageId), latitude: lat, longitude: lng,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })
  );
  res.json({ results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SOS app running on http://localhost:${port}`));
