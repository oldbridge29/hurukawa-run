// index.js (ES Module)
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// --------- HiDPI + リサイズ ---------
function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降、座標はCSSピクセル基準
}
window.addEventListener("resize", resize);
resize();

// --------- ユーティリティ ---------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

function aabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// --------- 入力（キーボード + タッチ）---------
const input = {
  jumpPressed: false,
  slideHeld: false,
  startPressed: false,
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") input.jumpPressed = true;
  if (e.code === "ArrowDown") input.slideHeld = true;
  if (e.code === "Enter") input.startPressed = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown") input.slideHeld = false;
});

// スマホ：タップでジャンプ、下スワイプ（または長押し）でスライド
let touchStartY = null;
canvas.addEventListener("pointerdown", (e) => {
  input.startPressed = true;
  touchStartY = e.clientY;
  // 長押し気味ならスライド扱い（押してる間）
  input.slideHeld = true;
});
canvas.addEventListener("pointermove", (e) => {
  if (touchStartY == null) return;
  const dy = e.clientY - touchStartY;
  if (dy > 30) input.slideHeld = true;
});
canvas.addEventListener("pointerup", (e) => {
  // クリック/タップ：ジャンプ
  input.jumpPressed = true;
  input.slideHeld = false;
  touchStartY = null;
});

// --------- ゲーム定数 ---------
const GROUND_RATIO = 0.78; // 画面高さに対する地面位置
const GRAVITY = 2200;      // px/s^2
const JUMP_VY = -820;      // px/s
const BASE_SPEED = 420;    // px/s（右から左へ流れる速度）
const MAX_SPEED = 980;

// --------- 状態管理（START/PLAY/ENDの考え方）---------
const STATE = {
  START: "START",
  PLAY: "PLAY",
  END: "END",
};

let state = STATE.START;

// --------- オブジェクト ---------
class Player {
  constructor() {
    this.reset();
  }
  reset() {
    this.wRun = 44;
    this.hRun = 64;
    this.wSlide = 58;
    this.hSlide = 40;

    this.x = 140;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;

    this.isSliding = false;
    this.slideTimer = 0;

    this.invuln = 0; // 被弾後の無敵フラッシュ
  }

  getRect() {
    const w = this.isSliding ? this.wSlide : this.wRun;
    const h = this.isSliding ? this.hSlide : this.hRun;
    return { x: this.x, y: this.y - h, w, h };
  }

  update(dt, groundY) {
    // スライド
    this.isSliding = input.slideHeld;

    // ジャンプ（1フレーム押下を消費）
    if (input.jumpPressed) {
      if (this.onGround && !this.isSliding) {
        this.vy = JUMP_VY;
        this.onGround = false;
      }
      input.jumpPressed = false;
    }

    // 重力
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;

    // 接地
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      this.onGround = true;
    }

    if (this.invuln > 0) this.invuln -= dt;
  }

  draw(ctx) {
    const r = this.getRect();
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * 0.5, r.y + r.h + 8, r.w * 0.45, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 本体
    const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    if (blink) return;

    // クッキーっぽい色（簡易）
    ctx.fillStyle = "#f3b56b";
    ctx.strokeStyle = "#8a4b1f";
    ctx.lineWidth = 2;

    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.stroke();

    // 顔（簡易）
    ctx.fillStyle = "#2a1a14";
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.68, r.y + r.h * 0.35, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.55, r.y + r.h * 0.35, 3, 0, Math.PI * 2);
    ctx.fill();

    // 口
    ctx.strokeStyle = "#2a1a14";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.62, r.y + r.h * 0.55, 7, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

class Obstacle {
  constructor(x, groundY, kind = "ground") {
    this.kind = kind; // "ground" or "air"
    this.w = kind === "ground" ? rand(34, 54) : rand(38, 60);
    this.h = kind === "ground" ? rand(42, 70) : rand(30, 46);
    this.x = x;
    this.y = kind === "ground" ? groundY - 0 : groundY - rand(90, 140);
    this.passed = false;
  }
  rect() {
    return {
      x: this.x,
      y: this.kind === "ground" ? this.y - this.h : this.y - this.h,
      w: this.w,
      h: this.h,
    };
  }
  update(dt, speed) {
    this.x -= speed * dt;
  }
  draw(ctx) {
    const r = this.rect();
    ctx.fillStyle = this.kind === "ground" ? "#ff4d6d" : "#5aa9ff";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.stroke();
  }
}

class Coin {
  constructor(x, y) {
    this.r = 10;
    this.x = x;
    this.y = y;
    this.t = 0;
    this.collected = false;
  }
  rect() {
    return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
  }
  update(dt, speed) {
    this.t += dt;
    this.x -= speed * dt;
    // ふわふわ
    this.y += Math.sin(this.t * 10) * 0.4;
  }
  draw(ctx) {
    if (this.collected) return;
    ctx.fillStyle = "#ffd54a";
    ctx.strokeStyle = "#a57500";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ハイライト
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(this.x - 3, this.y - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = rand(-220, 220);
    this.vy = rand(-260, -60);
    this.life = rand(0.25, 0.45);
    this.color = color;
  }
  update(dt) {
    this.life -= dt;
    this.vy += 1200 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx) {
    ctx.globalAlpha = clamp(this.life / 0.45, 0, 1);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, 4, 4);
    ctx.globalAlpha = 1;
  }
}

// --------- ゲーム全体 ---------
const player = new Player();
let obstacles = [];
let coins = [];
let particles = [];

let scroll = 0;
let score = 0;
let coinCount = 0;
let highScore = Number(localStorage.getItem("runner_highscore") || 0);

let spawnTimer = 0;
let coinTimer = 0;
let speed = BASE_SPEED;

function resetGame() {
  const groundY = window.innerHeight * GROUND_RATIO;
  player.reset();
  player.y = groundY;

  obstacles = [];
  coins = [];
  particles = [];

  scroll = 0;
  score = 0;
  coinCount = 0;

  spawnTimer = 0.0;
  coinTimer = 0.0;
  speed = BASE_SPEED;
}

function startGame() {
  resetGame();
  state = STATE.PLAY;
}

// --------- 背景描画（簡易パララックス）---------
function drawBackground(dt) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const groundY = h * GROUND_RATIO;

  // 空
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b1020");
  grad.addColorStop(1, "#1b2a55");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 星っぽい点
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 60; i++) {
    const x = (i * 173 + (scroll * 0.06)) % w;
    const y = (i * 97) % Math.floor(groundY - 40);
    ctx.fillRect(x, y, 2, 2);
  }

  // 遠景の丘（スクロール）
  const far = (scroll * 0.22) % w;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.moveTo(-far, groundY);
  for (let x = -w; x <= w * 2; x += 120) {
    const xx = x - far;
    const yy = groundY - 80 - 40 * Math.sin((x + scroll * 0.02) * 0.01);
    ctx.quadraticCurveTo(xx + 60, yy, xx + 120, groundY);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 地面
  ctx.fillStyle = "#1a1320";
  ctx.fillRect(0, groundY, w, h - groundY);

  // 地面のライン（速度感）
  const lineOffset = (scroll * 0.9) % 50;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  for (let x = -lineOffset; x < w; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 18);
    ctx.lineTo(x + 25, groundY + 18);
    ctx.stroke();
  }

  return groundY;
}

// --------- UI描画 ---------
function drawUI() {
  const w = window.innerWidth;

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`SCORE  ${Math.floor(score)}`, 18, 34);

  ctx.fillStyle = "rgba(255,213,74,0.95)";
  ctx.fillText(`COIN  ${coinCount}`, 18, 58);

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`HI  ${Math.floor(highScore)}`, w - 110, 34);
}

// --------- 画面（START/END）---------
function drawOverlayStart() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("COOKIE-RUNNER MINI", 40, h * 0.38);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Space / ↑ / Tap でジャンプ", 40, h * 0.38 + 46);
  ctx.fillText("↓ / Press でスライド（くぐる）", 40, h * 0.38 + 72);

  ctx.fillStyle = "#ffd54a";
  ctx.font = "800 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Enter / Tap でスタート", 40, h * 0.38 + 118);
}

function drawOverlayEnd() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("GAME OVER", 40, h * 0.38);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`SCORE  ${Math.floor(score)}`, 40, h * 0.38 + 54);
  ctx.fillStyle = "rgba(255,213,74,0.95)";
  ctx.fillText(`COIN   ${coinCount}`, 40, h * 0.38 + 84);

  ctx.fillStyle = "#ffd54a";
  ctx.font = "800 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Enter / Tap でリトライ", 40, h * 0.38 + 132);
}

// --------- スポーン制御 ---------
function spawnObstacle(groundY) {
  // 地上/空中を混ぜる
  const kind = Math.random() < 0.7 ? "ground" : "air";
  const x = window.innerWidth + rand(40, 120);
  obstacles.push(new Obstacle(x, groundY, kind));
}

function spawnCoins(groundY) {
  // 3〜6枚の小さな列
  const n = Math.floor(rand(3, 7));
  const startX = window.innerWidth + rand(80, 180);
  const baseY = groundY - rand(110, 190);
  for (let i = 0; i < n; i++) {
    coins.push(new Coin(startX + i * 26, baseY + Math.sin(i) * 10));
  }
}

// --------- メインループ（requestAnimationFrame）---------
let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;

  // クリア + 背景（毎フレーム再描画）
  // ※ requestAnimationFrame + clearRect の考え方は社内資料の説明とも一致 [1](https://globaldenso.sharepoint.com/teams/TMS_o365_jp116436/Shared%20Documents/General/Javascript%e6%95%99%e8%82%b2/docs/session_guides/after_guides/Session2-After-Guide.pdf?web=1)
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // スクロール量
  if (state === STATE.PLAY) {
    scroll += speed * dt;
  }

  const groundY = drawBackground(dt);

  if (state === STATE.START) {
    // デモ的にプレイヤー表示
    player.y = groundY;
    player.update(0, groundY);
    player.draw(ctx);
    drawOverlayStart();

    if (input.startPressed) {
      input.startPressed = false;
      startGame();
    }
    requestAnimationFrame(loop);
    return;
  }

  if (state === STATE.END) {
    // 止め絵
    player.draw(ctx);
    obstacles.forEach(o => o.draw(ctx));
    coins.forEach(c => c.draw(ctx));
    drawUI();
    drawOverlayEnd();

    if (input.startPressed) {
      input.startPressed = false;
      startGame();
    }
    requestAnimationFrame(loop);
    return;
  }

  // -------- PLAY更新 --------
  // 徐々に難しく：スピード上昇
  speed = clamp(BASE_SPEED + score * 0.9, BASE_SPEED, MAX_SPEED);

  // スコア：生存時間 + 速度ボーナス
  score += dt * (40 + speed * 0.04);

  // スポーン間隔：速くなるほど短く
  spawnTimer -= dt;
  const spawnInterval = clamp(1.15 - score * 0.0008, 0.52, 1.15);
  if (spawnTimer <= 0) {
    spawnObstacle(groundY);
    spawnTimer = spawnInterval + rand(-0.12, 0.18);
  }

  // コイン
  coinTimer -= dt;
  if (coinTimer <= 0) {
    spawnCoins(groundY);
    coinTimer = rand(1.1, 1.8);
  }

  // 更新：プレイヤー
  player.update(dt, groundY);

  // 更新：障害物
  for (const o of obstacles) o.update(dt, speed);
  obstacles = obstacles.filter(o => o.x + 120 > -50);

  // 更新：コイン
  for (const c of coins) c.update(dt, speed);
  coins = coins.filter(c => c.x > -50 && !c.collected);

  // パーティクル
  for (const p of particles) p.update(dt);
  particles = particles.filter(p => p.life > 0);

  // -------- 衝突判定 --------
  const pr = player.getRect();

  // 障害物に当たったらゲームオーバー
  for (const o of obstacles) {
    const or = o.rect();
    // 少し当たり判定を甘く
    const shrink = 6;
    const or2 = { x: or.x + shrink, y: or.y + shrink, w: or.w - shrink * 2, h: or.h - shrink * 2 };
    const pr2 = { x: pr.x + 5, y: pr.y + 5, w: pr.w - 10, h: pr.h - 10 };
    if (aabb(pr2, or2)) {
      if (player.invuln <= 0) {
        player.invuln = 0.6;
        // 1発アウトにするなら即END
        state = STATE.END;
        highScore = Math.max(highScore, Math.floor(score));
        localStorage.setItem("runner_highscore", String(highScore));
      }
      break;
    }
  }

  // コイン取得
  for (const c of coins) {
    if (c.collected) continue;
    if (aabb(pr, c.rect())) {
      c.collected = true;
      coinCount += 1;
      score += 50;

      // エフェクト
      for (let i = 0; i < 10; i++) particles.push(new Particle(c.x, c.y, "#ffd54a"));
    }
  }

  // -------- 描画 --------
  // コイン→障害物→プレイヤー→パーティクル→UI
  coins.forEach(c => c.draw(ctx));
  obstacles.forEach(o => o.draw(ctx));
  player.draw(ctx);
  particles.forEach(p => p.draw(ctx));
  drawUI();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);