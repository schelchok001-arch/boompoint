// server.js — Telegram webhook + расширенное меню (Node 18+)
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
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${method}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── клавиатуры ──────────────────────────────────────────────────────────────
const mainKeyboard = {
  keyboard: [
    [{ text: '✨ Получить бонус' }, { text: 'ℹ️ О проекте' }],
    [{ text: '🎬 Видео-совет' }, { text: '🧘 Дыхание 1 мин' }],
    [{ text: '🎶 Музыка для ресурса' }, { text: '😂 Шутка от Щелчка' }]
  ],
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

function inlineMusic() {
  return {
    inline_keyboard: [
      [{ text: '🎧 Плейлист 1', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' }],
      [{ text: '🎧 Плейлист 2', url: 'https://www.youtube.com/watch?v=5qap5aO4i9A' }],
      [{ text: '🔁 Меню', callback_data: 'menu' }],
    ],
  };
}

function randomJoke() {
  const jokes = [
    'Щелчок пришёл — грусть ушла… не забудь ей помахать ручкой 👋',
    'Если жизнь дала лимоны — добавь щепотку блеска и сделай лимонад ✨',
    'Иногда лучший план — просто вдох… выдох… и ещё раз вдох 😌',
    'Сегодня ты — апгрейд-версия себя. Обновление установлено ✅',
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}

function makeBonusCode() {
  return 'BP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
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
        const code = makeBonusCode();
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
      if (text === '/start' || text === '/menu') {
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
          text: 'Доступно:\n/start или /menu — меню\n/help — помощь\n/about — о проекте',
        });
        return res.sendStatus(200);
      }

      if (text === '/about' || text === 'ℹ️ О проекте') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: '«Щелчок» — мгновенное переключение в ресурсное состояние. ✨ Друг, наставник и юморист, который возвращает тебя в свет.',
          reply_markup: inlineAbout(),
        });
        return res.sendStatus(200);
      }

      // кнопки меню
      if (text === '✨ Получить бонус') {
        const code = makeBonusCode();
        await tg('sendMessage', {
          chat_id: chatId,
          text: `Твой бонус-код: *${code}*`,
          parse_mode: 'Markdown',
          reply_markup: inlineBonus(),
        });
        return res.sendStatus(200);
      }

      if (text === '🎬 Видео-совет') {
        await tg('sendMessage', {
          chat_id: chatId,
          disable_web_page_preview: false,
          text:
            '🎬 Мягкий совет на сегодня:\n' +
            '• Встань, расправь плечи, улыбнись — это уже меняет состояние.\n' +
            '• Короткое видео (2 мин): https://youtu.be/2OEL4P1Rz04\n' +
            '• Если хочется глубже — вот ещё одно: https://youtu.be/aGVXj3Z7z9k\n\n' +
            'Готов продолжать? Нажми «/menu».',
        });
        return res.sendStatus(200);
      }

      if (text === '🧘 Дыхание 1 мин') {
        await tg('sendMessage', {
          chat_id: chatId,
          text:
            '🧘 Дыхание 1 мин (4–4–4–4):\n' +
            '1) Вдох 4 счёта\n2) Задержка 4 счёта\n3) Выдох 4 счёта\n4) Пауза 4 счёта\n' +
            'Повтори 6 кругов. Я рядом 💛',
        });
        return res.sendStatus(200);
      }

      if (text === '🎶 Музыка для ресурса') {
        await tg('sendMessage', {
          chat_id: chatId,
          text: 'Выбери плейлист, включи и позволь себе расцвести 🌿',
          reply_markup: inlineMusic(),
        });
        return res.sendStatus(200);
      }

      if (text === '😂 Шутка от Щелчка') {
        await tg('sendMessage', { chat_id: chatId, text: randomJoke() });
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
