// server.js
// Минимальный сервер Express для Telegram Webhook (Node 18+)

const express = require('express');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET; // выберите сами и задайте в окружении
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ Не задан TELEGRAM_BOT_TOKEN (переменная окружения).');
}
if (!SECRET) {
  console.error('❌ Не задан TELEGRAM_WEBHOOK_SECRET (переменная окружения).');
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const app = express();
app.use(express.json());

// Простой healthcheck
app.get('/', (_req, res) => res.status(200).send('OK'));

async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${text}`);
  }
  return res.json();
}

// Маршрут вебхука: https://<ваш-домен>/webhook/<SECRET>
app.post(`/webhook/${SECRET}`, async (req, res) => {
  // Доп. защита: проверяем секретный заголовок, если вы его зададите при setWebhook
  const headerSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (headerSecret && headerSecret !== SECRET) {
    return res.status(401).send('Invalid secret token');
  }

  const update = req.body;

  try {
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';

      if (text.startsWith('/start')) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Бот жив! ✨ Готов принимать сообщения.',
        });
      } else {
        await tg('sendMessage', {
          chat_id: chatId,
          text: `Вы написали: "${text}"`,
        });
      }
    }
  } catch (err) {
    console.error('Handler error:', err);
  }

  // Вебхуку важно быстро ответить
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  if (!TOKEN || !SECRET) {
    console.log('ℹ️  Задайте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в окружении.');
  }
});
