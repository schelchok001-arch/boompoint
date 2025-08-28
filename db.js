const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // для Neon
});

async function ensureUser(telegramId, username = null) {
  await pool.query(
    `INSERT INTO users (telegram_id, username)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username`,
    [telegramId, username]
  );
}

async function addPoints(telegramId, delta = 1) {
  await pool.query(
    `UPDATE users
       SET points = COALESCE(points,0) + $2
     WHERE telegram_id = $1`,
    [telegramId, delta]
  );
}

async function getPoints(telegramId) {
  const { rows } = await pool.query(
    `SELECT points FROM users WHERE telegram_id = $1`,
    [telegramId]
  );
  return rows[0]?.points ?? 0;
}

async function getTop(limit = 10) {
  const { rows } = await pool.query(
    `SELECT username, telegram_id, points
     FROM users
     ORDER BY points DESC NULLS LAST, created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = { ensureUser, addPoints, getPoints, getTop };
