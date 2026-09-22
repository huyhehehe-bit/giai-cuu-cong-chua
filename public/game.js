(() => {
  'use strict';

  // ================== CẤU HÌNH ==================
  const T = 32;                 // kích thước 1 ô (px)
  const VW = 960, VH = 544;     // khung nhìn
  const LW = 214, LH = 17;      // kích thước màn chơi (ô)
  const GROUND_Y = 15;          // hàng mặt đất
  const GRAV = 1900, MAXFALL = 950, MAXSPD = 230;
  const JUMP_V = -760;          // vận tốc bật nhảy
  const HOLD_GRAV = 0.3;        // giữ phím nhảy → trọng lực chỉ còn 30% khi đang bay lên
  const HOLD_MAX = 0.55;        // ...trong tối đa 0.55 giây → bay cao tới tầm mây
  const GAME_TIME = 600;        // 10 phút
  const COIN_POINTS = 10;       // mỗi xu = 10 điểm
  const QUIZ_COINS = 5;         // trả lời đúng → rơi ra 5 xu
  const PROFILE_KEY = 'hero_profile';

  // Mã ô
  const EMPTY = 0, GROUND = 1, BRICK = 2, QBLOCK = 3, USED = 4, PIPE = 5, HARD = 6;

  const GAPS = [[38, 40], [70, 73], [112, 114], [150, 153]];
  const PIPES = [[28, 2], [36, 3], [46, 4], [57, 4], [134, 2], [142, 3], [168, 2]];
  const ENEMY_X = [22, 31, 44, 52, 62, 66, 80, 90, 96, 105, 109, 130, 137, 146, 160, 164, 170, 176];
  // 20 ô ? ↔ 20 câu hỏi mỗi lượt
  const QBLOCKS = [
    [16, 11], [21, 11], [23, 11], [22, 7], [51, 11], [65, 11], [78, 11], [84, 7], [90, 11], [94, 11],
    [100, 11], [103, 11], [100, 7], [131, 11], [139, 11], [146, 11], [157, 11], [158, 7], [165, 11], [173, 10],
  ];
  const CHECKPOINT_X = 100 * T;
  const CASTLE_X = 201;
  const PRINCESS = { x: 198 * T, y: GROUND_Y * T - 44, w: 26, h: 44 };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
  };

  const shuffle = a => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const fmtTime = s => {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // ================== ÂM THANH ==================
  let actx = null;
  function initAudio() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  function beep(freq, dur = 0.1, type = 'square', vol = 0.06, slide = 0) {
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur);
  }
  const seq = (notes, gap, dur) => notes.forEach((f, i) => setTimeout(() => beep(f, dur), i * gap));
  const sfx = {
    jump: () => beep(380, 0.16, 'square', 0.05, 320),
    coin: () => { beep(988, 0.07); setTimeout(() => beep(1319, 0.2), 70); },
    stomp: () => beep(220, 0.12, 'triangle', 0.12, -140),
    bump: () => beep(140, 0.08, 'square', 0.07),
    brick: () => beep(100, 0.18, 'sawtooth', 0.07, -50),
    die: () => seq([523, 392, 330, 262, 196], 150, 0.16),
    win: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 140, 0.2),
    check: () => seq([659, 880], 90, 0.12),
    right: () => seq([784, 988, 1319], 90, 0.14),
    wrong: () => seq([220, 165], 180, 0.25),
  };

  // ================== SPRITE (pixel art) ==================
  const HERO_TOP = [
    '...RRRRR....',
    '..RRRRRRRRR.',
    '..HHHSSHS...',
    '.HSHSSSHSSS.',
    '.HSHHSSSHSSS',
    '.HHSSSSHHHH.',
    '...SSSSSSS..',
    '..RRBRRR....',
    '.RRRBRRBRRR.',
    'RRRRBBBBRRRR',
    'SSRBYBBYBRSS',
    'SSSBBBBBBSSS',
    'SSBBBBBBBBSS',
  ];
  const HERO_STAND = HERO_TOP.concat(['..BBB..BBB..', '.KKK....KKK.', 'KKKK....KKKK']);
  const HERO_WALK = HERO_TOP.concat(['...BBBBBB...', '...KKKKK....', '...KKKKKK...']);
  const HERO_JUMP = HERO_TOP.concat(['.BBB....BBB.', 'KKK......KKK', 'KK........KK']);
  const HERO_PAL = { R: '#e52521', H: '#6b3a10', S: '#fcb68b', B: '#2b50e8', Y: '#ffd23f', K: '#5a2d0c' };

  const GOOMBA = [
    '.....BBBB.....',
    '....BBBBBB....',
    '...BBBBBBBB...',
    '..BWWBBBBWWB..',
    '.BBWKWBBWKWBB.',
    '.BBWKWBBWKWBB.',
    'BBBWWWBBWWWBBB',
    'BBBBBBBBBBBBBB',
    '.BBBBBBBBBBBB.',
    '....TTTTTT....',
    '...TTTTTTTT...',
    '..KKTTTTTTKK..',
    '.KKKKTTTTKKKK.',
    '.KKKK....KKKK.',
  ];
  const GOOMBA_PAL = { B: '#9c4a00', W: '#fce0a8', K: '#1a0f05', T: '#e4a672' };

  const PRINCESS_MAP = [
    '....C.C.C....',
    '....CCCCC....',
    '...YYYYYYY...',
    '..YYSSSSSYY..',
    '..YSKSSSKSY..',
    '..YSSSSSSSY..',
    '..YSSSRSSSY..',
    '..YYSSSSSYY..',
    '.YYY.SSS.YYY.',
    '.YY.PPPPP.YY.',
    '..SPPPWPPPS..',
    '.SS.PPPPP.SS.',
    '....PPPPP....',
    '...PPPPPPP...',
    '...PDPPPDPP..',
    '..PPPPPPPPP..',
    '..PDPPPPPDPP.',
    '.PPPPPPPPPPP.',
    '.PDPPPPPPPDP.',
    'PPPPPPPPPPPPP',
    'PDPPPDPPPDPPP',
    '.DDDDDDDDDDD.',
  ];
  const PRINCESS_PAL = { C: '#ffd700', Y: '#f5c542', S: '#fcd2b0', K: '#222', R: '#e0245e', P: '#ff7ac1', D: '#d94a9a', W: '#4fc3f7' };

  function drawSprite(map, pal, x, y, s, flip) {
    const w = map[0].length;
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < w; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(Math.round(x + (flip ? w - 1 - c : c) * s), Math.round(y + r * s), s, s);
      }
    }
  }

  // ================== TRẠNG THÁI ==================
  let grid, pipes, coins, enemies;
  let hero, camX = 0, gt = 0;
  let state = 'menu';            // menu | playing | paused | quiz | dying | win | over
  let score = 0, coinCount = 0, deaths = 0, timeLeft = GAME_TIME;
  let correct = 0, answered = 0, quizQueue = [], quiz = null;
  let checkpoint = 3 * T, checkpointReached = false;
  let particles = [], popups = [], coinPops = [], bumps = [], hearts = [];
  let deathT = 0, winT = 0, endShown = false, introT = 0, penaltyT = 0, penaltyLost = 0;
  let profile = store.get(PROFILE_KEY, { name: '', id: '' });

  // ================== XÂY MÀN CHƠI ==================
  function buildLevel() {
    grid = Array.from({ length: LH }, () => new Uint8Array(LW));
    const set = (x, y, t) => { if (x >= 0 && x < LW && y >= 0 && y < LH) grid[y][x] = t; };
    const inGap = x => GAPS.some(([a, b]) => x >= a && x <= b);

    for (let x = 0; x < LW; x++) if (!inGap(x)) { set(x, GROUND_Y, GROUND); set(x, GROUND_Y + 1, GROUND); }

    pipes = PIPES.map(([x, h]) => {
      for (let y = GROUND_Y - h; y < GROUND_Y; y++) { set(x, y, PIPE); set(x + 1, y, PIPE); }
      return { x, h };
    });

    // Gạch
    [20, 22, 24, 50, 52, 77, 79, 106, 107, 108, 138, 140, 156, 158, 159].forEach(x => set(x, 11, BRICK));
    [172, 174, 175].forEach(x => set(x, 10, BRICK));
    for (let x = 80; x <= 87; x++) set(x, 7, BRICK);
    // Ô ?
    QBLOCKS.forEach(([x, y]) => set(x, y, QBLOCK));
    // Cầu thang giữa màn
    for (let i = 0; i < 4; i++) for (let h = 0; h <= i; h++) set(117 + i, 14 - h, HARD);
    for (let i = 0; i < 4; i++) for (let h = 0; h <= 3 - i; h++) set(123 + i, 14 - h, HARD);
    // Cầu thang cuối
    for (let i = 0; i < 8; i++) for (let h = 0; h <= i; h++) set(180 + i, 14 - h, HARD);
    for (let h = 0; h < 8; h++) set(188, 14 - h, HARD);

    // Xu
    coins = [];
    const addCoin = (tx, ty) => coins.push({ x: tx * T + 8, y: ty * T + 4, w: 16, h: 24, taken: false });
    [9, 10, 11].forEach(x => addCoin(x, 12));
    [20, 22, 24].forEach(x => addCoin(x, 10));
    GAPS.forEach(([a, b]) => { for (let x = a; x <= b; x++) addCoin(x, 11); });
    for (let x = 60; x <= 64; x++) addCoin(x, 12);
    for (let x = 81; x <= 86; x++) addCoin(x, 6);
    for (let x = 96; x <= 98; x++) addCoin(x, 13);
    addCoin(121, 9); addCoin(122, 9);
    for (let x = 156; x <= 159; x++) addCoin(x, 10);
    for (let i = 0; i < 8; i++) addCoin(180 + i, 13 - i);
    for (let x = 192; x <= 195; x++) addCoin(x, 12);
    // Xu trên trời — phải giữ phím nhảy để bay tới
    [[30, 34], [88, 92], [144, 148]].forEach(([a, b]) => { for (let x = a; x <= b; x++) addCoin(x, 4); });
  }

  function resetEnemies() {
    enemies = ENEMY_X.map(tx => ({
      x: tx * T + 2, y: GROUND_Y * T - 28, w: 28, h: 28,
      vx: -60, vy: 0, mode: 'walk', t: 0, active: false, onGround: false,
    }));
  }

  function spawnHero() {
    hero = {
      x: checkpoint, y: GROUND_Y * T - 30, w: 22, h: 30,
      vx: 0, vy: 0, face: 1, onGround: false, anim: 0,
      coyote: 0, jbuf: 0, jumping: false, holdT: 0, inv: 2,
    };
  }

  function buildQuizQueue() {
    const bank = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
    quizQueue = shuffle(bank).slice(0, QBLOCKS.length).map(q => ({
      q: q.q,
      opts: shuffle(q.o.map((t, i) => ({ t, correct: i === q.a }))),
    }));
  }

  function resetGame() {
    buildLevel();
    resetEnemies();
    buildQuizQueue();
    score = 0; coinCount = 0; deaths = 0; timeLeft = GAME_TIME;
    correct = 0; answered = 0; quiz = null;
    checkpoint = 3 * T; checkpointReached = false;
    particles = []; popups = []; coinPops = []; bumps = []; hearts = [];
    endShown = false; winT = 0; deathT = 0; introT = 3; penaltyT = 0;
    spawnHero();
    hero.inv = 0;
  }

  // ================== VA CHẠM ==================
  function solid(tx, ty) {
    if (tx < 0 || tx >= LW) return true;
    if (ty < 0 || ty >= LH) return false;
    return grid[ty][tx] !== EMPTY;
  }

  function moveX(o, dx) {
    o.x += dx;
    const top = Math.floor(o.y / T), bot = Math.floor((o.y + o.h - 1) / T);
    if (dx > 0) {
      const tx = Math.floor((o.x + o.w - 1) / T);
      for (let ty = top; ty <= bot; ty++) if (solid(tx, ty)) { o.x = tx * T - o.w; return true; }
    } else if (dx < 0) {
      const tx = Math.floor(o.x / T);
      for (let ty = top; ty <= bot; ty++) if (solid(tx, ty)) { o.x = (tx + 1) * T; return true; }
    }
    return false;
  }

  // Trả về ô bị đụng đầu (nếu có)
  function moveY(o, dy) {
    o.y += dy;
    o.onGround = false;
    const l = Math.floor(o.x / T), r = Math.floor((o.x + o.w - 1) / T);
    if (dy > 0) {
      const ty = Math.floor((o.y + o.h - 1) / T);
      for (let tx = l; tx <= r; tx++) {
        if (solid(tx, ty)) { o.y = ty * T - o.h; o.vy = 0; o.onGround = true; return null; }
      }
    } else if (dy < 0) {
      const ty = Math.floor(o.y / T);
      let best = null, bd = Infinity;
      const cx = o.x + o.w / 2;
      for (let tx = l; tx <= r; tx++) {
        if (solid(tx, ty)) {
          const d = Math.abs(tx * T + T / 2 - cx);
          if (d < bd) { bd = d; best = tx; }
        }
      }
      if (best !== null) { o.y = (ty + 1) * T; o.vy = 0; return { tx: best, ty }; }
    }
    return null;
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function popup(x, y, text, color = '#fff') { popups.push({ x, y, text, color, life: 0.9 }); }

  function addCoins(n) {
    coinCount += n;
    score += n * COIN_POINTS;
  }

  function bumpBlock(tx, ty) {
    const t = grid[ty][tx];
    if (t === QBLOCK) {
      grid[ty][tx] = USED;
      bumps.push({ tx, ty, t: 0 });
      sfx.bump();
      openQuiz(tx, ty);
    } else if (t === BRICK) {
      grid[ty][tx] = EMPTY;
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: tx * T + (i % 2) * 16 + 4, y: ty * T + (i < 2 ? 0 : 16) + 4,
          vx: (i % 2 ? 1 : -1) * (80 + Math.random() * 60), vy: -500 + (i < 2 ? -120 : 0),
          life: 1.2, size: 10, color: '#b5531d',
        });
      }
      sfx.brick();
    } else {
      sfx.bump();
    }
    // Hạ quái đang đứng trên ô bị đập
    for (const e of enemies) {
      if (e.mode === 'walk' && Math.abs(e.y + e.h - ty * T) < 4 && e.x + e.w > tx * T && e.x < (tx + 1) * T) {
        e.mode = 'flip'; e.vy = -380;
        sfx.stomp();
      }
    }
  }

  function dropQuizCoins(tx, ty) {
    for (let i = 0; i < QUIZ_COINS; i++) {
      coinPops.push({
        x: tx * T + 8, y: ty * T - 8,
        vx: (i - (QUIZ_COINS - 1) / 2) * 70, vy: -560 - Math.random() * 80, life: 0.75,
      });
    }
    addCoins(QUIZ_COINS);
    popup(tx * T - 4, ty * T - 24, '+' + QUIZ_COINS * COIN_POINTS, '#ffd23f');
    sfx.coin();
  }

  // ================== CÂU HỎI ==================
  const quizScreen = $('quizScreen'), quizText = $('quizText'), quizOpts = $('quizOpts'), quizNote = $('quizNote');
  const QUIZ_NOTE = `Trả lời đúng: +${QUIZ_COINS} xu (${QUIZ_COINS * COIN_POINTS} điểm). Bấm phím 1–4 hoặc nhấp chuột.`;

  function openQuiz(tx, ty) {
    const item = quizQueue.shift();
    if (!item) { dropQuizCoins(tx, ty); return; }   // phòng khi thiếu câu hỏi
    state = 'quiz';
    quiz = { item, tx, ty, done: false };
    keys.left = keys.right = keys.jump = false;

    quizText.textContent = item.q;
    quizOpts.innerHTML = '';
    item.opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = i + 1;
      const s = document.createElement('span');
      s.textContent = o.t;
      b.append(k, s);
      b.addEventListener('click', () => answerQuiz(i));
      quizOpts.appendChild(b);
    });
    quizNote.className = 'quiz-note';
    quizNote.textContent = QUIZ_NOTE;
    quizScreen.classList.remove('hidden');
  }

  function answerQuiz(i) {
    if (!quiz || quiz.done) return;
    quiz.done = true;
    answered++;
    const ok = quiz.item.opts[i].correct;
    [...quizOpts.children].forEach((b, j) => {
      b.disabled = true;
      if (quiz.item.opts[j].correct) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
    });
    if (ok) {
      correct++;
      quizNote.className = 'quiz-note ok';
      quizNote.textContent = `Chính xác! +${QUIZ_COINS} xu 🪙`;
      sfx.right();
    } else {
      quizNote.className = 'quiz-note err';
      quizNote.textContent = 'Sai rồi! Đáp án đúng được tô xanh.';
      sfx.wrong();
    }
    const q = quiz;
    setTimeout(() => closeQuiz(q, ok), ok ? 900 : 2000);
  }

  function closeQuiz(q, ok) {
    if (quiz !== q) return;
    quiz = null;
    quizScreen.classList.add('hidden');
    if (state !== 'quiz') return;
    state = 'playing';
    hero.jumping = false;
    if (ok) dropQuizCoins(q.tx, q.ty);
    else popup(q.tx * T - 2, q.ty * T - 24, 'SAI', '#ff6b6b');
    canvas.focus();
  }

  // ================== CẬP NHẬT ==================
  const keys = { left: false, right: false, jump: false };
  let jumpPressed = false;

  function updateHero(dt) {
    const p = hero;
    let dir = 0;
    if (keys.left && !keys.right) dir = -1;
    else if (keys.right && !keys.left) dir = 1;

    if (dir !== 0) {
      const accel = p.onGround ? 1600 : 1000;
      const turning = Math.sign(p.vx) === -dir;
      p.vx += dir * accel * (turning ? 1.8 : 1) * dt;
      if (Math.abs(p.vx) > MAXSPD) p.vx = Math.sign(p.vx) * MAXSPD;
      p.face = dir;
    } else {
      const dec = (p.onGround ? 1500 : 400) * dt;
      p.vx = Math.abs(p.vx) <= dec ? 0 : p.vx - Math.sign(p.vx) * dec;
    }

    // Nhảy (có coyote time + jump buffer để điều khiển mượt)
    p.coyote = p.onGround ? 0.09 : p.coyote - dt;
    p.jbuf = jumpPressed ? 0.12 : p.jbuf - dt;
    if (p.jbuf > 0 && p.coyote > 0) {
      p.vy = JUMP_V; p.jbuf = 0; p.coyote = 0; p.jumping = true; p.holdT = HOLD_MAX;
      sfx.jump();
    }
    // Buông phím sớm → nhảy thấp; giữ phím → bay cao
    if (!keys.jump && p.jumping && p.vy < 0) { p.vy *= 0.45; p.jumping = false; }

    let g = GRAV;
    if (p.jumping && keys.jump && p.vy < 0 && p.holdT > 0) { g *= HOLD_GRAV; p.holdT -= dt; }
    p.vy = Math.min(p.vy + g * dt, MAXFALL);
    const prevBottom = p.y + p.h;

    if (moveX(p, p.vx * dt)) p.vx = 0;
    const hit = moveY(p, p.vy * dt);
    if (p.onGround) p.jumping = false;
    if (hit) { p.jumping = false; bumpBlock(hit.tx, hit.ty); if (state !== 'playing') return; }

    p.anim += Math.abs(p.vx) * dt;
    if (p.inv > 0) p.inv -= dt;

    if (p.y > LH * T) { killHero(); return; }

    if (!checkpointReached && p.x > CHECKPOINT_X) {
      checkpointReached = true; checkpoint = CHECKPOINT_X;
      popup(CHECKPOINT_X - 20, 15 * T - 120, 'CHECKPOINT');
      sfx.check();
    }

    for (const c of coins) {
      if (!c.taken && overlap(p, c)) {
        c.taken = true;
        addCoins(1);
        sfx.coin();
      }
    }

    // Va chạm quái
    for (const e of enemies) {
      if (e.mode !== 'walk' || !overlap(p, e)) continue;
      if (p.vy > 0 && prevBottom <= e.y + 10) {
        e.mode = 'squash'; e.t = 0;
        p.vy = keys.jump ? -620 : -420;
        p.jumping = keys.jump; p.holdT = 0.25;
        sfx.stomp();
      } else if (p.inv <= 0) {
        killHero();
        return;
      }
    }

    if (overlap(p, PRINCESS)) winGame();
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.active) {
        if (e.x < camX + VW + 64) e.active = true;
        else continue;
      }
      if (e.mode === 'walk') {
        e.vy = Math.min(e.vy + GRAV * dt, MAXFALL);
        if (moveX(e, e.vx * dt)) e.vx = -e.vx;
        moveY(e, e.vy * dt);
        e.t += dt;
        if (e.y > LH * T) e.mode = 'gone';
      } else if (e.mode === 'squash') {
        e.t += dt;
        if (e.t > 0.5) e.mode = 'gone';
      } else if (e.mode === 'flip') {
        e.vy += GRAV * dt;
        e.y += e.vy * dt;
        e.x += e.vx * 0.5 * dt;
        if (e.y > LH * T + 64) e.mode = 'gone';
      }
    }
    // Quái đụng nhau thì quay đầu
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.mode !== 'walk' || !a.active) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.mode !== 'walk' || !b.active || !overlap(a, b)) continue;
        if (a.x < b.x) { a.vx = -Math.abs(a.vx); b.vx = Math.abs(b.vx); }
        else { a.vx = Math.abs(a.vx); b.vx = -Math.abs(b.vx); }
      }
    }
  }

  function updateEffects(dt) {
    for (const p of particles) { p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.y -= 45 * dt; p.life -= dt; }
    popups = popups.filter(p => p.life > 0);
    for (const c of coinPops) { c.vy += GRAV * dt; c.x += (c.vx || 0) * dt; c.y += c.vy * dt; c.life -= dt; }
    coinPops = coinPops.filter(c => c.life > 0);
    for (const b of bumps) b.t += dt;
    bumps = bumps.filter(b => b.t < 0.15);
    for (const h of hearts) { h.y += h.vy * dt; h.x += Math.sin(h.t * 3 + h.seed) * 20 * dt; h.t += dt; }
    hearts = hearts.filter(h => h.t < 2.5);
  }

  function updateCamera() {
    const maxCam = LW * T - VW;
    if (state === 'menu') {
      camX = (gt * 50) % maxCam;
      return;
    }
    const target = hero.x + hero.w / 2 - VW * 0.4;
    camX = Math.max(0, Math.min(maxCam, target));
  }

  function killHero() {
    if (state !== 'playing') return;
    state = 'dying';
    deathT = 0;
    hero.vy = -620;
    sfx.die();
  }

  function afterDeath() {
    deaths++;
    penaltyLost = score - Math.floor(score / 2);
    score = Math.floor(score / 2);
    penaltyT = 2.5;
    resetEnemies();
    spawnHero();
    state = 'playing';
  }

  function winGame() {
    state = 'win';
    winT = 0;
    hero.vx = 0;
    sfx.win();
  }

  function timeUp() {
    state = 'over';
    if (quiz) { quiz = null; quizScreen.classList.add('hidden'); }
    sfx.die();
    showEnd('timeout');
  }

  function update(dt) {
    gt += dt;
    if (state === 'playing' || state === 'quiz' || state === 'dying') {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; timeUp(); }
    }
    if (state === 'playing') {
      if (introT > 0) introT -= dt;
      if (penaltyT > 0) penaltyT -= dt;
      updateHero(dt);
      if (state === 'playing') updateEnemies(dt);
    } else if (state === 'dying') {
      deathT += dt;
      if (deathT > 0.4) { hero.vy += GRAV * dt; hero.y += hero.vy * dt; }
      if (deathT > 2.2) afterDeath();
    } else if (state === 'win') {
      winT += dt;
      hero.vy = Math.min(hero.vy + GRAV * dt, MAXFALL);
      moveY(hero, hero.vy * dt);
      if (Math.random() < dt * 8) {
        hearts.push({ x: PRINCESS.x + Math.random() * 60 - 20, y: PRINCESS.y, vy: -60 - Math.random() * 50, t: 0, seed: Math.random() * 6 });
      }
      if (winT > 2.5 && !endShown) showEnd('win');
    }
    if (state !== 'paused') updateEffects(dt);
    updateCamera();
  }

  // ================== VẼ ==================
  function drawCloud(x, y, s) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 22 * s, y - 10 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 46 * s, y, 18 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x, y, 46 * s, 18 * s);
  }

  function drawHill(x, baseY, w, h) {
    ctx.fillStyle = '#5fbf4a';
    ctx.strokeStyle = '#2f7a25';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, baseY, w / 2, h, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3f9a32';
    ctx.fillRect(x - 20, baseY - h * 0.6, 6, 12);
    ctx.fillRect(x + 12, baseY - h * 0.45, 6, 12);
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#5c94fc');
    g.addColorStop(1, '#a9cdff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    for (let i = 0; i < 24; i++) {
      const hx = i * 520 + 80 - camX * 0.35;
      if (hx < -300 || hx > VW + 300) continue;
      const big = i % 2 === 0;
      drawHill(hx, GROUND_Y * T, big ? 280 : 170, big ? 150 : 90);
    }
    for (let i = 0; i < 40; i++) {
      const cx = i * 330 + (i * 97) % 180 - camX * 0.2;
      if (cx < -150 || cx > VW + 50) continue;
      drawCloud(cx, 100 + (i * 61) % 120, i % 3 === 0 ? 1.3 : 1);
    }
  }

  function drawBush(x, y) {
    ctx.fillStyle = '#3cb043';
    ctx.beginPath();
    ctx.arc(x + 16, y, 16, Math.PI, 0);
    ctx.arc(x + 40, y - 6, 20, Math.PI, 0);
    ctx.arc(x + 64, y, 16, Math.PI, 0);
    ctx.fill();
  }

  function drawTile(t, x, y, tx, ty) {
    switch (t) {
      case GROUND: {
        ctx.fillStyle = '#c8662e'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#9a4718';
        ctx.fillRect(x, y + 15, T, 2); ctx.fillRect(x + 15, y, 2, 15);
        ctx.fillRect(x + 6, y + 17, 2, 15); ctx.fillRect(x + 24, y + 17, 2, 15);
        const top = ty === 0 || grid[ty - 1][tx] !== GROUND;
        if (top) {
          ctx.fillStyle = '#3fae3a'; ctx.fillRect(x, y, T, 7);
          ctx.fillStyle = '#2e8a2b'; ctx.fillRect(x, y + 7, T, 2);
          ctx.fillStyle = '#6fd35f'; ctx.fillRect(x, y, T, 2);
        }
        break;
      }
      case BRICK: {
        ctx.fillStyle = '#b5531d'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#e27b43'; ctx.fillRect(x, y + 2, T, 2); ctx.fillRect(x, y + 18, T, 2);
        ctx.fillStyle = '#4a1d06';
        ctx.fillRect(x, y, T, 2); ctx.fillRect(x, y + 15, T, 2);
        ctx.fillRect(x + 15, y, 2, 15); ctx.fillRect(x + 7, y + 16, 2, 16); ctx.fillRect(x + 23, y + 16, 2, 16);
        break;
      }
      case QBLOCK: {
        const flash = ['#f8b800', '#f8b800', '#f8b800', '#e09000', '#c07000', '#e09000'][Math.floor(gt * 8) % 6];
        ctx.fillStyle = '#7a4400'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = flash; ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
        ctx.fillStyle = '#7a4400';
        [[4, 4], [T - 7, 4], [4, T - 7], [T - 7, T - 7]].forEach(([a, b]) => ctx.fillRect(x + a, y + b, 3, 3));
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', x + T / 2 + 2, y + T / 2 + 3);
        ctx.fillStyle = '#fff3c0';
        ctx.fillText('?', x + T / 2, y + T / 2 + 1);
        break;
      }
      case USED: {
        ctx.fillStyle = '#5a3418'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#8a5a33'; ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
        ctx.fillStyle = '#5a3418';
        [[4, 4], [T - 7, 4], [4, T - 7], [T - 7, T - 7]].forEach(([a, b]) => ctx.fillRect(x + a, y + b, 3, 3));
        break;
      }
      case HARD: {
        ctx.fillStyle = '#7a4318'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#e8a868'; ctx.fillRect(x, y, T - 3, T - 3);
        ctx.fillStyle = '#c07a3c'; ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
        break;
      }
    }
  }

  function bumpOffset(tx, ty) {
    for (const b of bumps) if (b.tx === tx && b.ty === ty) return -Math.sin(b.t / 0.15 * Math.PI) * 10;
    return 0;
  }

  function drawPipe(p) {
    const x = p.x * T, top = (GROUND_Y - p.h) * T, h = p.h * T;
    ctx.fillStyle = '#063d0c'; ctx.fillRect(x + 2, top + 28, 60, h - 28);
    ctx.fillStyle = '#1f9e2c'; ctx.fillRect(x + 5, top + 28, 54, h - 28);
    ctx.fillStyle = '#7ee07e'; ctx.fillRect(x + 12, top + 28, 6, h - 28);
    ctx.fillStyle = '#0c6116'; ctx.fillRect(x + 46, top + 28, 8, h - 28);
    ctx.fillStyle = '#063d0c'; ctx.fillRect(x - 2, top, 68, 30);
    ctx.fillStyle = '#27b336'; ctx.fillRect(x + 1, top + 3, 62, 24);
    ctx.fillStyle = '#8ef08e'; ctx.fillRect(x + 8, top + 3, 6, 24);
    ctx.fillStyle = '#0c6116'; ctx.fillRect(x + 50, top + 3, 9, 24);
  }

  function stoneRect(x, y, w, h) {
    ctx.fillStyle = '#9aa0ad'; ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#6b7080';
    for (let r = 0; r * 16 < h; r++) {
      const yy = y + r * 16;
      ctx.fillRect(x, yy, w, 2);
      for (let c = -1; c * 32 < w; c++) ctx.fillRect(x + c * 32 + (r % 2 ? 16 : 0), yy, 2, 16);
    }
    ctx.restore();
    ctx.strokeStyle = '#3d414c'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawCastle() {
    const x = CASTLE_X * T, gy = GROUND_Y * T;
    const bw = 7 * T, bh = 5 * T;
    for (let i = 0; i < 7; i++) stoneRect(x + i * T + 4, gy - bh - 16, 24, 18);
    stoneRect(x, gy - bh, bw, bh);
    const tx = x + 2 * T, th = 3 * T;
    for (let i = 0; i < 3; i++) stoneRect(tx + i * T + 4, gy - bh - th - 16, 24, 18);
    stoneRect(tx, gy - bh - th, 3 * T, th);
    ctx.fillStyle = '#1a0f05';
    ctx.fillRect(tx + T + 8, gy - bh - th + 30, 16, 26);
    ctx.beginPath(); ctx.arc(tx + T + 16, gy - bh - th + 30, 8, Math.PI, 0); ctx.fill();
    const dx = x + 3 * T;
    ctx.fillRect(dx, gy - 2 * T + 16, T, 2 * T - 16);
    ctx.beginPath(); ctx.arc(dx + T / 2, gy - 2 * T + 16, T / 2, Math.PI, 0); ctx.fill();
    const px = tx + 1.5 * T, py = gy - bh - th - 16;
    ctx.fillStyle = '#3d414c'; ctx.fillRect(px - 2, py - 70, 4, 70);
    const wave = Math.sin(gt * 4) * 4;
    ctx.fillStyle = '#ff7ac1';
    ctx.beginPath();
    ctx.moveTo(px + 2, py - 70);
    ctx.lineTo(px + 44, py - 58 + wave);
    ctx.lineTo(px + 2, py - 46);
    ctx.fill();
  }

  function drawCheckpoint() {
    const x = CHECKPOINT_X + 14, gy = GROUND_Y * T;
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x, gy - 110, 4, 110);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 2, gy - 112, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = checkpointReached ? '#3ad35a' : '#e52521';
    ctx.beginPath();
    ctx.moveTo(x + 4, gy - 106);
    ctx.lineTo(x + 36, gy - 94 + Math.sin(gt * 5) * 3);
    ctx.lineTo(x + 4, gy - 82);
    ctx.fill();
  }

  function drawCoin(x, y, t) {
    const w = Math.max(2, 8 * Math.abs(Math.cos(t)));
    ctx.fillStyle = '#b8860b';
    ctx.beginPath(); ctx.ellipse(x + 8, y + 12, w + 1.5, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd93b';
    ctx.beginPath(); ctx.ellipse(x + 8, y + 12, w, 10.5, 0, 0, Math.PI * 2); ctx.fill();
    if (w > 4) { ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + 7, y + 5, 2, 14); }
  }

  function drawEnemy(e) {
    if (e.mode === 'gone') return;
    if (e.mode === 'squash') {
      ctx.save();
      ctx.translate(e.x, e.y + e.h - 10);
      ctx.scale(1, 10 / 28);
      drawSprite(GOOMBA, GOOMBA_PAL, 0, 0, 2, false);
      ctx.restore();
      return;
    }
    if (e.mode === 'flip') {
      ctx.save();
      ctx.translate(e.x, e.y + e.h);
      ctx.scale(1, -1);
      drawSprite(GOOMBA, GOOMBA_PAL, 0, 0, 2, false);
      ctx.restore();
      return;
    }
    drawSprite(GOOMBA, GOOMBA_PAL, e.x, e.y, 2, Math.floor(e.t * 5) % 2 === 0);
  }

  function drawHero() {
    const p = hero;
    if (state === 'playing' && p.inv > 0 && Math.floor(gt * 20) % 2) return;
    let frame = HERO_STAND;
    if (state === 'dying' || !p.onGround) frame = HERO_JUMP;
    else if (Math.abs(p.vx) > 10 && Math.floor(p.anim / 18) % 2) frame = HERO_WALK;
    drawSprite(frame, HERO_PAL, p.x - 1, p.y - 2, 2, p.face < 0);
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function speechBubble(text, cx, bottomY) {
    ctx.font = '700 18px "Baloo 2", sans-serif';
    const w = ctx.measureText(text).width + 24, h = 34;
    const x = cx - w / 2, y = bottomY - h - 10;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1a0f05';
    ctx.lineWidth = 3;
    roundRectPath(x, y, w, h, 10);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8, y + h - 1); ctx.lineTo(cx, y + h + 10); ctx.lineTo(cx + 8, y + h - 1);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 8, y + h); ctx.lineTo(cx, y + h + 10); ctx.lineTo(cx + 8, y + h);
    ctx.stroke();
    ctx.fillStyle = '#d6246e';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + h / 2 + 2);
  }

  function shortName() {
    const parts = (profile.name || '').trim().split(/\s+/);
    return parts[parts.length - 1] || 'anh hùng';
  }

  function drawPrincess() {
    const bob = state === 'win' ? -Math.abs(Math.sin(gt * 8)) * 10 : Math.sin(gt * 2) * 1.5;
    drawSprite(PRINCESS_MAP, PRINCESS_PAL, PRINCESS.x, PRINCESS.y + bob, 2, false);
    const cx = PRINCESS.x + PRINCESS.w / 2;
    if (state === 'win') speechBubble('Cảm ơn ' + shortName() + '! ❤', cx, PRINCESS.y);
    else if (state !== 'menu' && PRINCESS.x - hero.x < 520) speechBubble('Cứu em với!', cx, PRINCESS.y);
    for (const h of hearts) {
      ctx.globalAlpha = Math.max(0, 1 - h.t / 2.5);
      ctx.fillStyle = '#ff3d7f';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('♥', h.x, h.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-Math.round(camX), 0);

    drawCastle();
    for (let x = 11; x < LW - 3; x += 17) {
      if (grid[GROUND_Y][x] && grid[GROUND_Y][x + 2] && !grid[GROUND_Y - 1][x] && !grid[GROUND_Y - 1][x + 2]) {
        drawBush(x * T, GROUND_Y * T);
      }
    }
    drawCheckpoint();

    const c0 = Math.max(0, Math.floor(camX / T) - 1), c1 = Math.min(LW - 1, c0 + Math.ceil(VW / T) + 2);
    for (let ty = 0; ty < LH; ty++) {
      for (let tx = c0; tx <= c1; tx++) {
        const t = grid[ty][tx];
        if (t === EMPTY || t === PIPE) continue;
        drawTile(t, tx * T, ty * T + bumpOffset(tx, ty), tx, ty);
      }
    }
    for (const p of pipes) drawPipe(p);

    coins.forEach((c, i) => { if (!c.taken) drawCoin(c.x, c.y, gt * 4 + i * 0.4); });
    for (const c of coinPops) drawCoin(c.x, c.y, gt * 20);

    for (const e of enemies) drawEnemy(e);
    drawPrincess();
    if (state !== 'menu') drawHero();

    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '12px "Press Start 2P", monospace';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#000';
      ctx.fillText(p.text, p.x + 18, p.y + 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x + 16, p.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function hudText(s, x, y, size, color = '#fff', font = '"Press Start 2P", monospace', align = 'left') {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillText(s, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function fitText(s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(0, 0, VW, 64);

    ctx.font = '700 20px "Baloo 2", sans-serif';
    hudText(fitText(profile.name, 230), 20, 28, 20, '#fff', '"Baloo 2", sans-serif');
    hudText('MSSV ' + profile.id, 20, 52, 11, '#ffd23f');

    hudText('SCORE', 280, 28, 12);
    hudText(String(score).padStart(5, '0'), 280, 52, 14);

    drawCoin(420, 30, gt * 4);
    hudText('x' + String(coinCount).padStart(2, '0'), 442, 52, 14);

    hudText('QUIZ', 540, 28, 12);
    hudText(correct + '/' + answered, 540, 52, 14, '#8ef08e');

    hudText('DEATH', 660, 28, 12);
    hudText(String(deaths), 660, 52, 14, deaths ? '#ff8080' : '#fff');

    hudText('TIME', 810, 28, 12);
    hudText(fmtTime(timeLeft), 810, 52, 14, timeLeft <= 60 && Math.floor(gt * 3) % 2 ? '#ff5050' : '#fff');
  }

  function drawCenterMsg(title, sub, color = '#ffd23f') {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, VH / 2 - 70, VW, 130);
    hudText(title, VW / 2, VH / 2 - 10, 26, color, '"Press Start 2P", monospace', 'center');
    if (sub) hudText(sub, VW / 2, VH / 2 + 34, 24, '#fff', '"Baloo 2", sans-serif', 'center');
  }

  function draw() {
    drawBackground();
    drawWorld();
    if (state === 'menu') return;
    drawHUD();
    if (state === 'paused') drawCenterMsg('PAUSED', 'Tạm dừng — nhấn P để chơi tiếp (đồng hồ dừng)');
    else if (state === 'playing' && penaltyT > 0) drawCenterMsg('-' + penaltyLost, 'Bạn đã chết — bị trừ nửa số điểm!', '#ff6b6b');
    else if (state === 'playing' && introT > 0) drawCenterMsg('WORLD 1-1', 'Đập ô ? để trả lời câu hỏi · Giữ Space để bay cao!');
    else if (state === 'win' && winT > 0.3) drawCenterMsg('YOU WIN!', 'Bạn đã giải cứu công chúa!');
    if (state === 'quiz') $('quizTime').textContent = '⏱ ' + fmtTime(timeLeft);
  }

  // ================== ĐẦU VÀO ==================
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  };

  function pressKey(k) {
    if (k === 'jump' && !keys.jump) jumpPressed = true;
    keys[k] = true;
  }

  window.addEventListener('keydown', e => {
    if (state === 'menu' || state === 'over' || endShown) return;
    if (state === 'quiz') {
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) { e.preventDefault(); answerQuiz(Number(m[1]) - 1); }
      else if (KEYMAP[e.code]) e.preventDefault();
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    pressKey(k);
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = false;
    if (state === 'playing') state = 'paused';
  });

  document.querySelectorAll('#touch button').forEach(btn => {
    const k = btn.dataset.key;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); pressKey(k); });
    const up = () => { keys[k] = false; };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  });

  function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
  }

  // ================== BẢNG XẾP HẠNG (máy chủ) ==================
  let board = null, boardError = false;

  async function api(path, body) {
    const res = await fetch(path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' });
    let data = {};
    try { data = await res.json(); } catch (e) { /* không phải JSON */ }
    if (!res.ok) throw new Error(data.error || 'Lỗi máy chủ (' + res.status + ')');
    return data;
  }

  async function fetchBoard() {
    try {
      board = await api('/api/leaderboard');
      boardError = false;
    } catch (e) {
      boardError = true;
    }
    renderBoard($('lbStart'), $('lbMetaStart'));
    renderBoard($('lbEnd'), $('lbMetaEnd'));
  }

  function renderBoard(el, metaEl) {
    el.innerHTML = '';
    const note = text => {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = text;
      el.appendChild(li);
    };
    if (boardError) { note('Không kết nối được máy chủ bảng xếp hạng.'); metaEl.textContent = ''; return; }
    if (!board) { note('Đang tải…'); return; }

    const started = new Date(board.round.startedAt);
    metaEl.textContent = `${board.total} người · vòng từ ${started.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${started.toLocaleDateString('vi-VN')}`;
    if (!board.entries.length) { note('Chưa có ai chơi vòng này — hãy là người đầu tiên!'); return; }

    board.entries.slice(0, 20).forEach(r => {
      const li = document.createElement('li');
      if (r.sid === profile.id) li.classList.add('me');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = `${r.won ? '👑 ' : ''}${r.name} `;
      const sm = document.createElement('small');
      sm.textContent = `(${r.sid})`;
      n.appendChild(sm);
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = r.score;
      li.append(n, s);
      el.appendChild(li);
    });
  }

  setInterval(() => { if (state === 'menu' || endShown) fetchBoard(); }, 5000);

  const submitStatus = $('submitStatus');
  async function submitScore(payload) {
    submitStatus.className = 'submit-status';
    submitStatus.textContent = 'Đang gửi điểm…';
    try {
      const d = await api('/api/score', payload);
      submitStatus.className = 'submit-status ok';
      submitStatus.textContent = d.improved
        ? `✔ Đã lưu điểm — bạn đang xếp hạng #${d.rank}`
        : `Kỷ lục của bạn vẫn là ${d.best.score} điểm — hạng #${d.rank}`;
    } catch (e) {
      submitStatus.className = 'submit-status err';
      submitStatus.textContent = 'Không gửi được điểm: ' + e.message + ' ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'link-btn';
      retry.textContent = 'Gửi lại';
      retry.addEventListener('click', () => submitScore(payload));
      submitStatus.appendChild(retry);
    }
    fetchBoard();
  }

  // ================== GIAO DIỆN ==================
  const startScreen = $('startScreen'), endScreen = $('endScreen');
  const form = $('startForm'), nameInput = $('nameInput'), idInput = $('idInput'), formError = $('formError');

  function showEnd(reason) {
    endShown = true;
    const won = reason === 'win';
    const timeUsed = Math.min(GAME_TIME, Math.round(GAME_TIME - timeLeft));
    $('endTitle').textContent = won ? '🎉 GIẢI CỨU THÀNH CÔNG!' : '⏱ HẾT GIỜ!';
    $('endMsg').textContent = won
      ? `Công chúa đã được ${profile.name} giải cứu!`
      : 'Hết 10 phút rồi — điểm của bạn vẫn được ghi nhận.';
    const rows = [
      ['Người chơi', profile.name],
      ['MSSV', profile.id],
      ['Điểm', score],
      ['Xu nhặt được', coinCount],
      ['Câu trả lời đúng', `${correct}/${answered}`],
      ['Số lần chết', deaths],
      ['Thời gian', fmtTime(timeUsed)],
    ];
    const dl = $('endStats');
    dl.innerHTML = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    });
    endScreen.classList.remove('hidden');
    $('btnRetry').focus();
    submitScore({
      name: profile.name, sid: profile.id, score, coins: coinCount, won,
      timeUsed, deaths, correct, answered,
    });
  }

  function startGame() {
    initAudio();
    resetGame();
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    quizScreen.classList.add('hidden');
    keys.left = keys.right = keys.jump = false;
    state = 'playing';
    canvas.focus();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    const id = idInput.value.trim().toUpperCase();
    nameInput.classList.remove('invalid');
    idInput.classList.remove('invalid');

    if (name.length < 2) {
      formError.textContent = 'Vui lòng nhập họ và tên (ít nhất 2 ký tự).';
      nameInput.classList.add('invalid');
      nameInput.focus();
      return;
    }
    if (!/^[A-Z0-9]{4,15}$/.test(id)) {
      formError.textContent = 'Mã số sinh viên chỉ gồm chữ và số, 4–15 ký tự.';
      idInput.classList.add('invalid');
      idInput.focus();
      return;
    }
    formError.textContent = '';
    profile = { name, id };
    store.set(PROFILE_KEY, profile);
    startGame();
  });

  $('btnRetry').addEventListener('click', startGame);
  $('btnChange').addEventListener('click', () => {
    endScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    state = 'menu';
    endShown = false;
    fetchBoard();
    nameInput.focus();
  });

  // Xoá bảng xếp hạng (cần mật khẩu quản trị)
  const resetDialog = $('resetDialog'), resetKey = $('resetKey'), resetError = $('resetError');
  $('btnReset').addEventListener('click', () => {
    resetKey.value = '';
    resetError.textContent = '';
    resetDialog.showModal();
    resetKey.focus();
  });
  $('resetCancel').addEventListener('click', () => resetDialog.close());
  $('resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('resetConfirm');
    btn.disabled = true;
    resetError.textContent = '';
    try {
      await api('/api/reset', { key: resetKey.value });
      resetDialog.close();
      await fetchBoard();
    } catch (err) {
      resetError.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ================== KHỞI ĐỘNG ==================
  nameInput.value = profile.name || '';
  idInput.value = profile.id || '';
  buildLevel();
  resetEnemies();
  spawnHero();
  fetchBoard();

  // Chỉ dùng khi test: mở /#debug để có window.__game
  if (location.hash === '#debug') {
    window.__game = {
      teleport(tx, ty = 5) { hero.x = tx * T; hero.y = ty * T; hero.vy = 0; },
      step(sec) { for (let i = 0; i < sec * 60; i++) { update(1 / 60); jumpPressed = false; } draw(); },
      press(k, down) { if (down) pressKey(k); else keys[k] = false; },
      get info() { return { state, score, coinCount, deaths, correct, answered, timeLeft, heroY: hero.y, totalCoins: coins.length, quiz: quizQueue.length }; },
    };
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (state !== 'paused') update(dt);
    jumpPressed = false;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
