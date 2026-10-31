# SOS Auto Sender (free version)

Automatic emergency alert with live location:
- **Telegram** (free, automatic, live location keeps updating)
- **WhatsApp** via CallMeBot (free, automatic)
- **SMS** backup link (opens SMS app) + optional paid Fast2SMS

## 1. Telegram bot (2 min)
1. In Telegram open **@BotFather** -> `/newbot` -> copy the token into `.env` as `TELEGRAM_BOT_TOKEN`.
2. Each trusted contact opens your bot once and presses **Start**.
3. In the app press **Find Telegram contacts** and tap the person to add their chat id.

## 2. WhatsApp via CallMeBot (per contact, one time)
Contact saves +34 644 51 95 23 on their phone and sends the message
`I allow callmebot to send me messages` on WhatsApp. They get an API key; enter it in the app.
(Check callmebot.com for current number/instructions.)

## 3. Run
```
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN
npm install
npm start
```
Open http://localhost:3000. For phone use deploy on Render/Railway (HTTPS needed for location).

## Using with GitHub Pages
Put `public/index.html` on GitHub Pages and set `API_BASE` at the top of its script to your backend URL.
