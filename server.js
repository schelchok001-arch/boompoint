/** BoomPoint production-ish server (Express + SQLite + Nodemailer) */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.set('trust proxy', 1);
const DB_FILE = process.env.DB_FILE || 'boompoint.db';
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, code TEXT UNIQUE, referrer_code TEXT, verified INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, points INTEGER, meta TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS balances (user_id TEXT PRIMARY KEY, points INTEGER);
CREATE TABLE IF NOT EXISTS login_tokens (code TEXT PRIMARY KEY, email TEXT, exp INTEGER);
CREATE TABLE IF NOT EXISTS rewards (id TEXT PRIMARY KEY, title TEXT, cost INTEGER, stock INTEGER, created_at INTEGER);
`);
function now(){ return Date.now(); }
function rid(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2,10); }
function getBalance(uid){ const r=db.prepare('SELECT points FROM balances WHERE user_id=?').get(uid); return r? r.points:0; }
function addPoints(uid, pts, action, meta={}){
  const id = rid('tx');
  db.prepare('INSERT INTO transactions (id,user_id,action,points,meta,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, uid, action, pts, JSON.stringify(meta||{}), now());
  const cur = getBalance(uid);
  const next = cur + pts;
  db.prepare('INSERT INTO balances (user_id,points) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET points = excluded.points').run(uid, next);
  return next;
}
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT||465),
  secure: String(process.env.SMTP_SECURE||'true')==='true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
async function sendOTP(email, code){
  const from = process.env.SMTP_FROM || 'no-reply@example.com';
  const site = process.env.SITE_URL || 'http://localhost:8787';
  const html = `<div style="font-family:system-ui">Ваш код входа: <b>${code}</b><br/>Код действует 10 минут. Откройте ${site} и введите код.</div>`;
  return mailer.sendMail({ from, to: email, subject: 'Ваш код входа — BoomPoint', html });
}
const limiter = rateLimit({ windowMs: 10*60*1000, max: 120 });
const authLimiter = rateLimit({ windowMs: 10*60*1000, max: 20 });
app.use(limiter);
// signup
app.post('/api/signup', authLimiter, (req,res)=>{
  const { name, email, ref } = req.body||{};
  if(!email) return res.status(400).json({error:'email_required'});
  const id = rid('u'); const code = id.slice(-6);
  try{
    db.prepare('INSERT INTO users (id,name,email,code,referrer_code,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, name||'', String(email).toLowerCase(), code, ref||null, now());
  }catch(e){ if(String(e).includes('UNIQUE')) return res.status(409).json({error:'email_exists'}); throw e;}
  addPoints(id, 100, 'signup');
  res.json({ id, name, email, code, balance:getBalance(id) });
});
// login start
app.post('/api/login/start', authLimiter, async (req,res)=>{
  const { email } = req.body||{};
  if(!email) return res.status(400).json({ok:false, error:'email_required'});
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase());
  if(!user) return res.status(404).json({ ok:false, error:'not_found' });
  const code = String(Math.floor(100000 + Math.random()*900000));
  db.prepare('INSERT OR REPLACE INTO login_tokens (code,email,exp) VALUES (?,?,?)').run(code, user.email, now()+10*60*1000);
  try{ await sendOTP(user.email, code); res.json({ ok:true }); }catch(err){ console.error(err); res.status(500).json({ ok:false, error:'mail_failed' }); }
});
// login verify
app.post('/api/login/verify', authLimiter, (req,res)=>{
  const { code } = req.body||{};
  const tok = db.prepare('SELECT * FROM login_tokens WHERE code=?').get(String(code||''));
  if(!tok) return res.status(400).json({ ok:false, error:'invalid_code' });
  if(now()>tok.exp){ db.prepare('DELETE FROM login_tokens WHERE code=?').run(tok.code); return res.status(400).json({ ok:false, error:'expired' }); }
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(tok.email);
  db.prepare('DELETE FROM login_tokens WHERE code=?').run(tok.code);
  res.json({ ok:true, user: { id:user.id, name:user.name, email:user.email, code:user.code, balance:getBalance(user.id) } });
});
// verify email
app.post('/api/verify-email', (req,res)=>{
  const { user_id } = req.body||{};
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(user_id||'');
  if(!user) return res.status(404).json({ error:'not_found' });
  if(!user.verified){
    db.prepare('UPDATE users SET verified=1 WHERE id=?').run(user_id);
    addPoints(user_id, 50, 'verify_email');
    if(user.referrer_code){
      const ref = db.prepare('SELECT * FROM users WHERE code=?').get(user.referrer_code);
      if(ref) addPoints(ref.id, 200, 'referral_confirmed', { referee:user_id });
    }
  }
  res.json({ ok:true, balance: getBalance(user_id) });
});
// daily
app.post('/api/event', (req,res)=>{
  const { user_id, action } = req.body||{};
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(user_id||'');
  if(!user) return res.status(404).json({ error:'not_found' });
  if(action!=='daily_checkin') return res.status(400).json({ error:'unknown_action' });
  const dayKey = 'checkin_'+new Date().toDateString();
  const exists = db.prepare('SELECT 1 FROM transactions WHERE user_id=? AND action=? AND meta LIKE ?').get(user_id, 'daily_checkin', '%'+dayKey+'%');
  if(exists) return res.json({ ok:false, msg:'already_checked' });
  const last = db.prepare(\"SELECT meta, created_at FROM transactions WHERE user_id=? AND action='daily_checkin' ORDER BY created_at DESC LIMIT 1\").get(user_id);
  let streak=1; if(last){ const prev=new Date(last.created_at).toDateString(); const yest=new Date(Date.now()-86400000).toDateString(); if(prev===yest) streak=(JSON.parse(last.meta||'{}').streak||0)+1; }
  const bonus = 10 + Math.min(20, 2*(streak-1));
  const bal = addPoints(user_id, bonus, 'daily_checkin', { key:dayKey, streak });
  res.json({ ok:true, bonus, streak, balance: bal });
});
// wallet + leaderboard
app.get('/api/wallet/:id', (req,res)=>{
  const id=req.params.id; const balance=getBalance(id);
  const txs=db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(id);
  res.json({ balance, transactions: txs });
});
app.get('/api/leaderboard', (req,res)=>{
  const weekAgo = now() - 7*24*60*60*1000;
  const rows = db.prepare(`SELECT u.name as name, u.id as user_id, SUM(t.points) as score
    FROM transactions t JOIN users u ON u.id=t.user_id
    WHERE t.created_at >= ? GROUP BY u.id ORDER BY score DESC LIMIT 10`).all(weekAgo);
  res.json({ top: rows });
});
// redirect ref + static
app.get('/r/:code', (req,res)=> res.redirect('/?ref='+encodeURIComponent(req.params.code)) );
app.use('/', express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 8787;
app.listen(PORT, ()=> console.log('BoomPoint API on :' + PORT));
