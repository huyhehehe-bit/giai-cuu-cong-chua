'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_KEY = process.env.ADMIN_KEY || (IS_PROD ? '' : 'admin');
const DATA_FILE = path.join(__dirname, 'data', 'leaderboard.json');

// Điểm tối đa có thể đạt: 67 xu rải trên màn * 10 + 20 ô ? * 5 xu * 10
const MAX_SCORE = 1670;
const MAX_TIME = 600;

if (!process.env.ADMIN_KEY) {
  console.warn(IS_PROD
    ? '[!] Chưa đặt ADMIN_KEY — nút xoá bảng xếp hạng sẽ bị khoá.'
    : '[!] Đang chạy local, mật khẩu quản trị mặc định là "admin".');
}

// ================== LƯU TRỮ (file JSON) ==================
function newRound() {
  return { id: crypto.randomUUID(), startedAt: Date.now() };
}

let db = { round: newRound(), entries: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) { /* chưa có file → bảng mới */ }

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db));
  } catch (e) {
    console.error('Không ghi được file dữ liệu:', e.message);
  }
}

// Xếp hạng: điểm cao hơn → đã cứu công chúa → dùng ít thời gian hơn
function compare(a, b) {
  return b.score - a.score || Number(b.won) - Number(a.won) || a.timeUsed - b.timeUsed;
}

function ranked() {
  return Object.values(db.entries).sort(compare);
}

// ================== APP ==================
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/leaderboard', (req, res) => {
  const list = ranked();
  res.json({ round: db.round, total: list.length, entries: list.slice(0, 100) });
});

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

app.post('/api/score', (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  const sid = typeof b.sid === 'string' ? b.sid.trim().toUpperCase() : '';

  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Tên không hợp lệ' });
  if (!/^[A-Z0-9]{4,15}$/.test(sid)) return res.status(400).json({ error: 'MSSV không hợp lệ' });
  if (!isInt(b.score, 0, MAX_SCORE) || !isInt(b.coins, 0, MAX_SCORE / 10) || b.score > b.coins * 10
    || !isInt(b.timeUsed, 0, MAX_TIME) || !isInt(b.deaths, 0, 10000)
    || !isInt(b.correct, 0, 100) || !isInt(b.answered, 0, 100) || b.correct > b.answered
    || typeof b.won !== 'boolean') {
    return res.status(400).json({ error: 'Dữ liệu điểm không hợp lệ' });
  }

  const entry = {
    sid, name, score: b.score, coins: b.coins, won: b.won, timeUsed: b.timeUsed,
    deaths: b.deaths, correct: b.correct, answered: b.answered, at: Date.now(),
  };
  // Mỗi MSSV chỉ giữ lượt chơi tốt nhất trong vòng hiện tại
  const cur = db.entries[sid];
  const improved = !cur || compare(entry, cur) < 0;
  if (improved) {
    db.entries[sid] = entry;
    save();
  }
  const rank = ranked().findIndex(e => e.sid === sid) + 1;
  res.json({ ok: true, improved, best: db.entries[sid], rank });
});

function keyMatches(given) {
  if (!ADMIN_KEY || typeof given !== 'string') return false;
  const h = s => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(given), h(ADMIN_KEY));
}

app.post('/api/reset', (req, res) => {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Máy chủ chưa cấu hình ADMIN_KEY' });
  if (!keyMatches((req.body || {}).key)) return res.status(403).json({ error: 'Sai mật khẩu quản trị' });
  db = { round: newRound(), entries: {} };
  save();
  console.log('Đã xoá bảng xếp hạng, bắt đầu vòng mới', db.round.id);
  res.json({ ok: true, round: db.round });
});

app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
