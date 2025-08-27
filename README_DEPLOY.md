# BoomPoint — продакшн-набор (Render)

Состав: server.js, package.json, .env.example, public/index.html

Шаги:
1) Render → New → Web Service → подключи репозиторий/загрузка этих файлов
2) Start Command: `node server.js`
3) Disks → Add Disk: 1GB, Mount Path `/data`
4) Env Vars: см. .env.example (SMTP, ADMIN_TOKEN, DB_FILE=/data/boompoint.db, SITE_URL=https://boompoint.ru)
5) Custom Domains → добавь boompoint.ru и пропиши DNS у регистратора
