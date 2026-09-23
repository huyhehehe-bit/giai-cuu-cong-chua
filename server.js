'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QUESTIONS = require('./questions');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_KEY = process.env.ADMIN_KEY || (IS_PROD ? '' : 'admin');
const DATA_FILE = path.join(__dirname, 'data', 'leaderboard.json');

const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 2;  // số lượt chơi mỗi MSSV trong 1 vòng
const QUIZ_COUNT = 12;         // số ô ? = số câu hỏi mỗi lượt
const QUIZ_SECONDS = 20;       // thời gian trả lời mỗi câu
const GRACE_MS = 2000;         // trừ hao độ trễ mạng khi kiểm tra hết giờ
const QUIZ_COINS = 5;          // trả lời đúng → 5 xu
const FIELD_COINS = 67;        // số xu rải sẵn trên màn
const COIN_POINTS = 10;
const MAX_COINS = FIELD_COINS + QUIZ_COUNT * QUIZ_COINS;
const MAX_TIME = 600;
const SESSION_TTL = 2 * 60 * 60 * 1000;

if (!process.env.ADMIN_KEY) {
  console.warn(IS_PROD
    ? '[!] Chưa đặt ADMIN_KEY — nút xoá bảng xếp hạng sẽ bị khoá.'
    : '[!] Đang chạy local, mật khẩu quản trị mặc định là "admin".');
}

// ================== LƯU TRỮ (file JSON) ==================
const newRound = () => ({ id: crypto.randomUUID(), startedAt: Date.now() });

let db = { round: newRound(), entries: {}, attempts: {} };
try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  db = { attempts: {}, ...saved };
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
const compare = (a, b) => b.score - a.score || Number(b.won) - Number(a.won) || a.timeUsed - b.timeUsed;
const ranked = () => Object.values(db.entries).sort(compare);

// ================== PHIÊN CHƠI ==================
// Đề bài và đáp án chỉ nằm ở server; trình duyệt không bao giờ nhận đáp án trước khi trả lời.
const sessions = new Map();

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions() {
  return shuffle(QUESTIONS).slice(0, QUIZ_COUNT).map(item => {
    const opts = shuffle(item.o.map((t, i) => ({ t, correct: i === item.a })));
    return { q: item.q, opts: opts.map(o => o.t), answer: opts.findIndex(o => o.correct) };
  });
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, s] of sessions) if (now - s.createdAt > SESSION_TTL) sessions.delete(token);
}
setInterval(pruneSessions, 10 * 60 * 1000).unref();

// ================== APP ==================
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({ maxAttempts: MAX_ATTEMPTS, quizCount: QUIZ_COUNT, quizCoins: QUIZ_COINS, coinPoints: COIN_POINTS, gameTime: MAX_TIME, quizSeconds: QUIZ_SECONDS });
});

app.get('/api/leaderboard', (req, res) => {
  const list = ranked();
  res.json({ round: db.round, total: list.length, entries: list.slice(0, 100) });
});

const cleanName = v => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const cleanSid = v => (typeof v === 'string' ? v.trim().toUpperCase() : '');
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Bắt đầu một lượt chơi: kiểm tra số lượt còn lại rồi phát đề (không kèm đáp án)
app.post('/api/session', (req, res) => {
  const name = cleanName((req.body || {}).name);
  const sid = cleanSid((req.body || {}).sid);
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Tên không hợp lệ' });
  if (!/^[A-Z0-9]{4,15}$/.test(sid)) return res.status(400).json({ error: 'MSSV không hợp lệ' });

  const used = db.attempts[sid] || 0;
  if (used >= MAX_ATTEMPTS) {
    return res.status(403).json({ error: `MSSV ${sid} đã dùng hết ${MAX_ATTEMPTS} lượt chơi của vòng này.` });
  }
  db.attempts[sid] = used + 1;
  save();

  const token = crypto.randomUUID();
  const questions = pickQuestions();
  sessions.set(token, {
    token, sid, name, round: db.round.id, questions,
    answers: new Array(QUIZ_COUNT).fill(null), askedAt: new Array(QUIZ_COUNT).fill(null),
    finished: false, createdAt: Date.now(),
  });

  // Không gửi kèm câu hỏi: từng câu chỉ được phát khi người chơi đập ô ?
  res.json({
    token,
    attemptsLeft: MAX_ATTEMPTS - used - 1,
    attemptNo: used + 1,
    maxAttempts: MAX_ATTEMPTS,
    quizCount: QUIZ_COUNT,
    quizSeconds: QUIZ_SECONDS,
  });
});

// Phát một câu hỏi và bắt đầu đếm giờ cho câu đó
app.post('/api/ask', (req, res) => {
  const { token, index } = req.body || {};
  const s = sessions.get(token);
  if (!s) return res.status(400).json({ error: 'Phiên chơi không tồn tại hoặc đã hết hạn' });
  if (s.finished) return res.status(400).json({ error: 'Lượt chơi đã kết thúc' });
  if (!isInt(index, 0, s.questions.length - 1)) return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  if (s.answers[index] !== null) return res.status(400).json({ error: 'Câu này đã được trả lời' });

  // Mở lại câu đang dở (ví dụ lỗi mạng) thì giữ nguyên đồng hồ cũ, không được gia hạn
  if (s.askedAt[index] === null) s.askedAt[index] = Date.now();
  const left = QUIZ_SECONDS * 1000 - (Date.now() - s.askedAt[index]);

  const q = s.questions[index];
  res.json({ q: q.q, opts: q.opts, index, secondsLeft: Math.max(0, left / 1000), quizSeconds: QUIZ_SECONDS });
});

// Chấm một câu hỏi (choice = -1 nghĩa là hết giờ)
app.post('/api/answer', (req, res) => {
  const { token, index, choice } = req.body || {};
  const s = sessions.get(token);
  if (!s) return res.status(400).json({ error: 'Phiên chơi không tồn tại hoặc đã hết hạn' });
  if (s.finished) return res.status(400).json({ error: 'Lượt chơi đã kết thúc' });
  if (!isInt(index, 0, s.questions.length - 1)) return res.status(400).json({ error: 'Câu hỏi không hợp lệ' });
  if (s.askedAt[index] === null) return res.status(400).json({ error: 'Câu này chưa được phát' });
  if (s.answers[index] !== null) return res.status(400).json({ error: 'Câu này đã được trả lời' });
  if (!isInt(choice, -1, 3)) return res.status(400).json({ error: 'Lựa chọn không hợp lệ' });

  // Hết giờ thì tính sai, dù trình duyệt gửi lên đáp án gì
  const expired = Date.now() - s.askedAt[index] > QUIZ_SECONDS * 1000 + GRACE_MS;
  const picked = expired ? -1 : choice;
  s.answers[index] = picked;
  const answer = s.questions[index].answer;
  res.json({ correct: picked === answer, answer, expired });
});

// Nộp điểm cuối lượt
app.post('/api/score', (req, res) => {
  const b = req.body || {};
  const s = sessions.get(b.token);
  if (!s) return res.status(400).json({ error: 'Phiên chơi đã hết hạn, điểm không được ghi nhận' });
  if (s.finished) return res.status(400).json({ error: 'Điểm của lượt này đã được ghi' });
  if (s.round !== db.round.id) return res.status(409).json({ error: 'Bảng xếp hạng đã được làm mới, lượt chơi này không còn tính' });

  const correct = s.answers.reduce((n, c, i) => n + (c !== null && c === s.questions[i].answer ? 1 : 0), 0);
  const answered = s.answers.filter(c => c !== null).length;
  const maxCoins = FIELD_COINS + correct * QUIZ_COINS;

  if (!isInt(b.coins, 0, maxCoins) || !isInt(b.score, 0, b.coins * COIN_POINTS)
    || !isInt(b.timeUsed, 0, MAX_TIME) || !isInt(b.deaths, 0, 10000) || typeof b.won !== 'boolean') {
    return res.status(400).json({ error: 'Dữ liệu điểm không hợp lệ' });
  }

  s.finished = true;
  const entry = {
    sid: s.sid, name: s.name, score: b.score, coins: b.coins, won: b.won,
    timeUsed: b.timeUsed, deaths: b.deaths, correct, answered, at: Date.now(),
  };
  const cur = db.entries[s.sid];
  const improved = !cur || compare(entry, cur) < 0;
  if (improved) db.entries[s.sid] = entry;
  save();

  const rank = ranked().findIndex(e => e.sid === s.sid) + 1;
  res.json({
    ok: true, improved, best: db.entries[s.sid], rank, correct, answered,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - (db.attempts[s.sid] || 0)),
  });
});

function keyMatches(given) {
  if (!ADMIN_KEY || typeof given !== 'string') return false;
  const h = v => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(h(given), h(ADMIN_KEY));
}

app.post('/api/reset', (req, res) => {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Máy chủ chưa cấu hình ADMIN_KEY' });
  if (!keyMatches((req.body || {}).key)) return res.status(403).json({ error: 'Sai mật khẩu quản trị' });
  db = { round: newRound(), entries: {}, attempts: {} };
  sessions.clear();
  save();
  console.log('Đã xoá bảng xếp hạng, bắt đầu vòng mới', db.round.id);
  res.json({ ok: true, round: db.round });
});

app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT} · ${QUESTIONS.length} câu hỏi · ${MAX_ATTEMPTS} lượt/MSSV`));
