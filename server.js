// server.js — Telegram webhook + меню и кнопки (Node 18+)
const express = require('express');

const TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PORT   = process.env.PORT || 3000;

if (!TOKEN)  console.error('❌ TELEGRAM_BOT_TOKEN не задан');
if (!SECRET) console.error('❌ TELEGRAM_WEBHOOK_SECRET не задан');

const API = `https://api.telegram.org/bot${TOKEN}`;
const app = express();
app.use(express.json());

// healthcheck
app.get('/', (_req, res) => res.send('OK'));

// удобная обёртка к Telegram API
async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${method}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── клавиатуры ──────────────────────────────────────────────────────────────
const mainKeyboard = {
  keyboard: [[{ text: '✨ Получить бонус' }, { text: 'ℹ️ О проекте' }]],
  resize_keyboard: true,
};

function inlineAbout() {
  return {
    inline_keyboard: [
      [{ text: '🌐 Сайт', url: 'https://boompoint.onrender.com' }],
      [{ text: '🔁 Показать меню', callback_data: 'menu' }],
    ],
  };
}

function inlineBonus() {
  return {
    inline_keyboard: [
      [{ text: '🎁 Ещё бонус', callback_data: 'bonus_again' }],
      [{ text: '🔁 Показать меню', callback_data: 'menu' }],
    ],
  };
}

// ── обработчик апдейтов ────────────────────────────────────────────────────
app.post(`/webhook/${SECRET}`, async (req, res) => {
  const u = req.body;

  try {
    // callback-кнопки
    if (u.callback_query) {
      const cq = u.callback_query;
      const chatId = cq.message.chat.id;

      if (cq.data === 'menu') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Главное меню:',
          reply_markup: mainKeyboard,
        });
      }

      if (cq.data === 'bonus_again') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Лови ещё 🎁' });
        const code = 'BP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        await tg('sendMessage', {
          chat_id: chatId,
          text: `Твой дополнительный бонус-код: *${code}*`,
          parse_mode: 'Markdown',
          reply_markup: inlineBonus(),
        });
      }
    }

    // обычные сообщения
    if (u.message) {
      const chatId = u.message.chat.id;
      const text = (u.message.text || '').trim();

      // команды
      if (text === '/start') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Бот жив! ✨ Готов принимать сообщения.\nВыберите действие ниже:',
          reply_markup: mainKeyboard,
        });
        return res.sendStatus(200);
      }

      if (text === '/help') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Доступно:\n/start — меню\n/help — помощь\n/about — о проекте',
        });
        return res.sendStatus(200);
      }

      if (text === '/about') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Щелчок — мгновенное переключение в ресурсное состояние. ✨',
          reply_markup: inlineAbout(),
        });
        return res.sendStatus(200);
      }

      // кнопки основного меню
      if (text === '✨ Получить бонус') {
        const code = 'BP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        await tg('sendMessage', {
          chat_id: chatId,
          text: `Твой бонус-код: *${code}*`,
          parse_mode: 'Markdown',
          reply_markup: inlineBonus(),
        });
        return res.sendStatus(200);
      }

      if (text === 'ℹ️ О проекте') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Щелчок — друг, наставник и юморист, который возвращает тебя в свет. 💫',
          reply_markup: inlineAbout(),
        });
        return res.sendStatus(200);
      }

      // эхо по умолчанию
      await tg('sendMessage', { chat_id: chatId, text: `Вы написали: "${text}"` });
    }
  } catch (e) {
    console.error('Handler error:', e);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
