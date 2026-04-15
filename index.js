// ===============================
// AB RUNNER - Full Version
// 工場＋道路（AB系） / 坂・地形 / バイオーム / 10種障害物 / コイン強化
// ===============================

// ---------- Canvas ----------
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// ---------- Player Image ----------
const denmaruImg = new Image();
denmaruImg.src = "./images/denmaru.png";
let denmaruReady = false;
denmaruImg.onload = () => (denmaruReady = true);

ctx.imageSmoothingEnabled = true;

// ---------- HiDPI ----------
function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ---------- Utils ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const aabb = (a, b) =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;

// ---------- Input ----------
const input = { jumpPressed: false, slideHeld: false, startPressed: false };

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") input.jumpPressed = true;
  if (e.code === "ArrowDown") input.slideHeld = true;
  if (e.code === "Enter") input.startPressed = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown") input.slideHeld = false;
});

// Touch
let touchStartY = null;
canvas.addEventListener("pointerdown", (e) => {
  input.startPressed = true;
  touchStartY = e.clientY;
  input.slideHeld = true;
});
canvas.addEventListener("pointermove", (e) => {
  if (touchStartY == null) return;
  if (e.clientY - touchStartY > 30) input.slideHeld = true;
});
canvas.addEventListener("pointerup", () => {
  input.jumpPressed = true;
  input.slideHeld = false;
  touchStartY = null;
});

// ---------- Constants ----------
const GRAVITY = 5000;
const JUMP_VY = -1500;
const BASE_SPEED = 420;
const MAX_SPEED = 3000;

// ---------- State ----------
const STATE = { START: "START", PLAY: "PLAY", END: "END" };
let state = STATE.START;

// ---------- Biomes (AB系) ----------
// ---------- Biomes (6コース) ----------
const BIOMES = [
  // デンソー本社（工場・施設っぽい）
  { name:"HQ", sky1:"#b7e3ff", sky2:"#e8f6ff", ground:"#4f5961", accent:"#ff9f1c", rough:35, airRate:0.20,
    pool:["TIRE","DRONE","GATE","SAW"] },

  // 市街地
  { name:"CITY", sky1:"#8fd3ff", sky2:"#cfe9ff", ground:"#5a5a5a", accent:"#ffd54a", rough:40, airRate:0.28,
    pool:["CAR","BIRD","GATE","SAW"] },

  // 田舎
  { name:"COUNTRY", sky1:"#a7e6a0", sky2:"#e9ffd9", ground:"#6b5a3a", accent:"#ffdd66", rough:55, airRate:0.22,
    pool:["ROCK","BIRD","GATE"] },

  // 森
  { name:"FOREST", sky1:"#2f8f6b", sky2:"#0f3b2a", ground:"#244132", accent:"#9cff6a", rough:70, airRate:0.30,
    pool:["LOG","BIRD","DRONE","GATE"] },

  // 海（浅瀬）
  { name:"SEA", sky1:"#6fd3ff", sky2:"#1f7fd6", ground:"#0c4b6b", accent:"#ff4d6d", rough:45, airRate:0.35,
    pool:["BUOY","BIRD","DRONE"] },

  // 深海
  { name:"DEEPSEA", sky1:"#081a2f", sky2:"#001018", ground:"#001826", accent:"#7df9ff", rough:60, airRate:0.45,
    pool:["SEA_MINE","ANGLER","DRONE"] },
];

let biomeIndex = 0;
let biome = BIOMES[0];

// ---------- Terrain (Slopes) ----------
class Terrain {
  constructor() {
    this.segs = [];
    this.baseY = 0;
    this.rough = 50;
  }
  resetWithBiome(b) {
    this.segs = [];
    this.baseY = window.innerHeight * 0.78;
    this.rough = b.rough;
    this._ensure(4000);
  }
  _ensure(wx) {
    let lastX = this.segs.length ? this.segs[this.segs.length-1].x1 : 0;
    let lastY = this.segs.length ? this.segs[this.segs.length-1].y1 : this.baseY;
    while (lastX < wx) {
      const len = rand(180, 420);
      const y1 = clamp(
        lastY + rand(-this.rough, this.rough),
        window.innerHeight * 0.55,
        window.innerHeight * 0.88
      );
      this.segs.push({ x0:lastX, x1:lastX+len, y0:lastY, y1 });
      lastX += len;
      lastY = y1;
    }
  }
  groundAt(wx) {
    this._ensure(wx + 1000);
    for (let i = this.segs.length-1; i >= 0; i--) {
      const s = this.segs[i];
      if (wx >= s.x0 && wx <= s.x1) {
        const t = (wx - s.x0) / (s.x1 - s.x0);
        return s.y0 + (s.y1 - s.y0) * t;
      }
    }
    return this.baseY;
  }
  draw(ctx, scroll) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.fillStyle = biome.ground;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w+20; x += 20) {
      ctx.lineTo(x, this.groundAt(scroll + x));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= w+20; x += 20) {
      const y = this.groundAt(scroll + x);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
const terrain = new Terrain();
terrain.resetWithBiome(biome);

// ---------- Player ----------
class Player {
  constructor() { this.reset(); }
  reset() {
    this.wRun = 100; this.hRun = 96;

    // しゃがみは「横を伸ばす」のをやめる（違和感の原因）
    this.wSlide = this.wRun;
    this.hSlide = 70;

    this.x = 140; this.y = 0; this.vy = 0;
    this.onGround = true; this.isSliding = false;
    this.invuln = 0; this.runPhase = 0;
  }

  // 表示用の矩形
  getRect() {
    const w = this.isSliding ? this.wSlide : this.wRun;
    const h = this.isSliding ? this.hSlide : this.hRun;
    return { x: this.x, y: this.y - h, w, h };
  }

  // 当たり判定は“やさしく”するために小さめのヒットボックスを返す
  getHitRect() {
    const r = this.getRect();

    // ラン時：上下左右を少し縮める
    // スライディング時：特に頭側をさらに縮めて「当たりにくく」
    const insetX = this.isSliding ? 16 : 14;
    const insetTop = this.isSliding ? 18 : 12;
    const insetBottom = 8;

    return {
      x: r.x + insetX,
      y: r.y + insetTop,
      w: r.w - insetX * 2,
      h: r.h - insetTop - insetBottom
    };
  }

  update(dt, groundY) {
    this.isSliding = input.slideHeld;

    if (input.jumpPressed) {
      if (this.onGround && !this.isSliding) {
        this.vy = JUMP_VY;
        this.onGround = false;
      }
      input.jumpPressed = false;
    }

    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;

    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      this.onGround = true;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.onGround) this.runPhase += dt * 14;
  }

  // ★影が飛ばないように groundY を受け取って地面に固定する
  draw(ctx, groundY) {
    const r = this.getRect();
    const bob = (this.onGround ? Math.sin(this.runPhase) * 2 : 0);

    // --- Shadow: 地面(groundY)に固定 ---
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(r.x + r.w * 0.5, groundY + 8, r.w * 0.45, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // invulnの点滅
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return;

    if (denmaruReady) {
      if (!this.isSliding) {
        // 通常表示
        ctx.drawImage(denmaruImg, r.x, r.y + bob, r.w, r.h);
      } else {
        // ★しゃがみは「縮めて引き伸ばす」ではなく「クリップ」で見せる
        // 走り用サイズのまま描画して、しゃがみ枠で切り取る
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y + bob, r.w, r.h);
        ctx.clip();

        // 下側が残るように少し下へ寄せて描画
        const yShift = (this.hRun - this.hSlide);
        ctx.drawImage(denmaruImg, r.x, (r.y + bob) - yShift, this.wRun, this.hRun);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = "#f3b56b";
      ctx.strokeStyle = "#8a4b1f";
      roundRect(ctx, r.x, r.y + bob, r.w, r.h, 10);
      ctx.fill(); ctx.stroke();
    }

    // （任意）ヒットボックス確認したい時だけオン
    // const hr = this.getHitRect();
    // ctx.strokeStyle="rgba(0,255,0,0.6)"; ctx.strokeRect(hr.x, hr.y, hr.w, hr.h);
  }
}
const player = new Player();

// ---------- Obstacles ----------
const OB_TYPES = [
  "CONE","BARRIER","PALLET","CRATE","SIGN",
  "DRONE","BIRD","LAMP","GATE","SAW"
];

// ---------- Obstacles (コース別・見た目強化) ----------

// 10種（見た目は各バイオームで使い分け）
const OB_CATALOG = {
  // HQ
  TIRE:   { kind:"ground", w:[52,78], h:[52,78] },
  // CITY
  CAR:    { kind:"ground", w:[90,140], h:[46,68] },
  // COUNTRY
  ROCK:   { kind:"ground", w:[55,95], h:[45,85] },
  // FOREST
  LOG:    { kind:"ground", w:[90,150], h:[40,60] },
  // SEA
  BUOY:   { kind:"ground", w:[44,64], h:[70,105] },
  // DEEPSEA
  SEA_MINE:{ kind:"air",   w:[52,78], h:[52,78] },
  ANGLER: { kind:"air",    w:[70,110], h:[40,70] },

  // 共通（空）
  DRONE:  { kind:"air",    w:[60,90],  h:[30,55] },
  BIRD:   { kind:"air",    w:[50,78],  h:[26,45] },

  // 共通（地上）
  GATE:   { kind:"ground", w:[70,110], h:[85,130] },
  SAW:    { kind:"ground", w:[48,76],  h:[48,76] },
};

class Obstacle {
  constructor(x, type, difficultyScale) {
    this.type = type;
    const def = OB_CATALOG[type] || { kind:"ground", w:[50,80], h:[50,90] };
    this.kind = def.kind;

    const w0 = rand(def.w[0], def.w[1]);
    const h0 = rand(def.h[0], def.h[1]);

    // ★難易度で少しずつ大きく
    const s = difficultyScale;
    this.w = w0 * s;
    this.h = h0 * s;

    this.x = x;

    const gy = terrain.groundAt(scroll + x);
    this.y = (this.kind === "ground") ? gy : gy - rand(110, 170);

    this.t = rand(0, Math.PI * 2);
  }

  // 表示矩形
  rect() { return { x:this.x, y:this.y - this.h, w:this.w, h:this.h }; }

  // ★当たり判定は“やさしく”＝障害物側も少し小さく
  hitRect() {
    const r = this.rect();
    const inset = Math.max(6, Math.min(14, r.w * 0.16));
    const insetTop = (this.kind === "air") ? inset : inset * 0.6;
    return {
      x: r.x + inset,
      y: r.y + insetTop,
      w: r.w - inset * 2,
      h: r.h - insetTop - inset * 0.6
    };
  }

  update(dt, speed) {
    this.x -= speed * dt;
    if (this.kind === "air") {
      this.t += dt * 4.5;
      this.y += Math.sin(this.t) * 0.35;
    }
  }

  draw(ctx) {
    const r = this.rect();
    drawObstacleFancy(ctx, r, this.type);
    // （任意）ヒットボックス確認
    // const hr=this.hitRect(); ctx.strokeStyle="rgba(255,0,0,0.5)"; ctx.strokeRect(hr.x,hr.y,hr.w,hr.h);
  }
}

// “それっぽい”描画（図形だけで雰囲気を出す）
function drawObstacleFancy(ctx, r, type) {
  ctx.save();

  if (type === "TIRE") {
    // タイヤ：ドーナツ＋溝
    const cx = r.x + r.w/2, cy = r.y + r.h/2;
    const R = Math.min(r.w, r.h) * 0.48;
    const r0 = R * 0.45;
    ctx.fillStyle="#2b2f36";
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation="destination-out";
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation="source-over";
    ctx.strokeStyle="rgba(255,255,255,0.10)";
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
      ctx.lineTo(cx+Math.cos(a)*R,  cy+Math.sin(a)*R);
      ctx.stroke();
    }

  } else if (type === "CAR") {
    // 車：ボディ＋窓＋タイヤ
    ctx.fillStyle="#e74c3c";
    roundRect(ctx, r.x, r.y + r.h*0.25, r.w, r.h*0.55, 10); ctx.fill();
    ctx.fillStyle="#c0392b";
    roundRect(ctx, r.x + r.w*0.18, r.y, r.w*0.52, r.h*0.45, 10); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.35)";
    roundRect(ctx, r.x + r.w*0.25, r.y + r.h*0.10, r.w*0.22, r.h*0.22, 6); ctx.fill();
    roundRect(ctx, r.x + r.w*0.50, r.y + r.h*0.10, r.w*0.16, r.h*0.22, 6); ctx.fill();
    ctx.fillStyle="#2b2f36";
    const wy = r.y + r.h*0.78;
    ctx.beginPath(); ctx.arc(r.x+r.w*0.25, wy, r.h*0.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(r.x+r.w*0.75, wy, r.h*0.18, 0, Math.PI*2); ctx.fill();

  } else if (type === "ROCK") {
    // 岩：多角形＋ハイライト
    ctx.fillStyle="#7a6f65";
    ctx.beginPath();
    ctx.moveTo(r.x+r.w*0.15, r.y+r.h*0.60);
    ctx.lineTo(r.x+r.w*0.30, r.y+r.h*0.20);
    ctx.lineTo(r.x+r.w*0.70, r.y+r.h*0.12);
    ctx.lineTo(r.x+r.w*0.90, r.y+r.h*0.55);
    ctx.lineTo(r.x+r.w*0.62, r.y+r.h*0.92);
    ctx.lineTo(r.x+r.w*0.22, r.y+r.h*0.86);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(r.x+r.w*0.32, r.y+r.h*0.28);
    ctx.lineTo(r.x+r.w*0.60, r.y+r.h*0.20);
    ctx.lineTo(r.x+r.w*0.52, r.y+r.h*0.45);
    ctx.closePath(); ctx.fill();

  } else if (type === "LOG") {
    // 丸太：茶＋年輪
    ctx.fillStyle="#7a4a1f";
    roundRect(ctx, r.x, r.y + r.h*0.25, r.w, r.h*0.55, 14); ctx.fill();
    ctx.fillStyle="rgba(0,0,0,0.18)";
    for(let i=0;i<4;i++){
      ctx.fillRect(r.x + r.w*(0.18+i*0.18), r.y + r.h*0.28, 6, r.h*0.50);
    }
    // 端の年輪
    ctx.strokeStyle="rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.arc(r.x+r.w*0.08, r.y+r.h*0.52, r.h*0.18, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x+r.w*0.08, r.y+r.h*0.52, r.h*0.10, 0, Math.PI*2); ctx.stroke();

  } else if (type === "BUOY") {
    // ブイ：赤白＋アンテナ
    ctx.fillStyle="#ff4d6d";
    roundRect(ctx, r.x + r.w*0.25, r.y + r.h*0.12, r.w*0.50, r.h*0.78, 18); ctx.fill();
    ctx.fillStyle="#ffffff";
    ctx.fillRect(r.x + r.w*0.25, r.y + r.h*0.40, r.w*0.50, r.h*0.12);
    ctx.strokeStyle="rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.moveTo(r.x + r.w*0.50, r.y + r.h*0.12);
    ctx.lineTo(r.x + r.w*0.50, r.y);
    ctx.stroke();

  } else if (type === "SEA_MINE") {
    // 機雷：球＋トゲ
    const cx=r.x+r.w/2, cy=r.y+r.h/2;
    const R=Math.min(r.w,r.h)*0.36;
    ctx.fillStyle="#334155";
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.arc(cx,cy,R*0.65,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="#1f2937";
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      ctx.beginPath();
      ctx.arc(cx+Math.cos(a)*R*1.25, cy+Math.sin(a)*R*1.25, R*0.18, 0, Math.PI*2);
      ctx.fill();
    }

  } else if (type === "ANGLER") {
    // チョウチンアンコウっぽい：本体＋発光球
    ctx.fillStyle="#0b3a4a";
    roundRect(ctx, r.x, r.y + r.h*0.20, r.w*0.78, r.h*0.60, 18); ctx.fill();
    ctx.fillStyle="#7df9ff";
    ctx.beginPath(); ctx.arc(r.x+r.w*0.92, r.y+r.h*0.26, r.h*0.14, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(125,249,255,0.65)";
    ctx.beginPath();
    ctx.moveTo(r.x+r.w*0.62, r.y+r.h*0.30);
    ctx.quadraticCurveTo(r.x+r.w*0.78, r.y+r.h*0.08, r.x+r.w*0.92, r.y+r.h*0.26);
    ctx.stroke();

  } else if (type === "DRONE") {
    ctx.fillStyle="#3b3f46";
    ctx.beginPath();
    ctx.ellipse(r.x+r.w/2, r.y+r.h/2, r.w*0.38, r.h*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.22)";
    ctx.fillRect(r.x+r.w*0.18, r.y+r.h*0.46, r.w*0.64, 4);

  } else if (type === "BIRD") {
    ctx.strokeStyle="rgba(255,255,255,0.75)";
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.arc(r.x+r.w*0.35, r.y+r.h*0.55, r.w*0.18, Math.PI*1.1, Math.PI*1.9);
    ctx.arc(r.x+r.w*0.65, r.y+r.h*0.55, r.w*0.18, Math.PI*1.1, Math.PI*1.9);
    ctx.stroke();

  } else if (type === "GATE") {
    // ゲート：枠
    ctx.strokeStyle="rgba(255,255,255,0.75)";
    ctx.lineWidth=6;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle="rgba(255,255,255,0.10)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

  } else if (type === "SAW") {
    // 丸ノコ：ギザギザ
    const cx=r.x+r.w/2, cy=r.y+r.h/2;
    const R=Math.min(r.w,r.h)*0.45;
    ctx.fillStyle="#cbd5e1";
    ctx.beginPath();
    for(let i=0;i<18;i++){
      const a=i*(Math.PI*2/18);
      const rr=(i%2===0)?R:R*0.78;
      ctx.lineTo(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle="#64748b";
    ctx.beginPath(); ctx.arc(cx,cy,R*0.22,0,Math.PI*2); ctx.fill();

  } else {
    // fallback
    ctx.fillStyle = biome.accent;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
  }

  ctx.restore();
}

// ---------- Coins ----------
class Coin {
  constructor(x,y){ this.x=x; this.y=y; this.r=10; this.t=0; this.collected=false; }
  rect(){ return { x:this.x-this.r, y:this.y-this.r, w:this.r*2, h:this.r*2 }; }
  update(dt,speed){ this.t+=dt; this.x-=speed*dt; this.y+=Math.sin(this.t*10)*0.4; }
  draw(ctx){
    if(this.collected) return;
    ctx.fillStyle="#ffd54a";
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
  }
}

// ---------- Particles ----------
class Particle {
  constructor(x,y,c){ this.x=x; this.y=y; this.vx=rand(-220,220); this.vy=rand(-260,-60); this.life=rand(0.25,0.45); this.c=c;}
  update(dt){ this.life-=dt; this.vy+=1200*dt; this.x+=this.vx*dt; this.y+=this.vy*dt; }
  draw(ctx){ ctx.globalAlpha=clamp(this.life/0.45,0,1); ctx.fillStyle=this.c; ctx.fillRect(this.x,this.y,4,4); ctx.globalAlpha=1;}
}

// ---------- Game Data ----------
let obstacles=[], coins=[], particles=[];
let scroll=0, score=0, coinCount=0;
let highScore=Number(localStorage.getItem("runner_highscore")||0);
let speed=BASE_SPEED;
let spawnTimer=0, coinTimer=0;
let playTime=0, lastMinute=0, hiFlash=0;
let stage = 0; // 15秒ごとのステージカウント（難易度）
let top20 = loadTop20();

// ---------- Helpers ----------
function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
  
}

// ---------- Top20 Scores ----------
const SCORE_KEY = "runner_top20";

function loadTop20(){
  try{
    const a = JSON.parse(localStorage.getItem(SCORE_KEY) || "[]");
    return Array.isArray(a) ? a.filter(n=>Number.isFinite(n)).sort((x,y)=>y-x).slice(0,20) : [];
  }catch(e){ return []; }
}
function saveTop20(arr){
  const a = arr.slice().sort((x,y)=>y-x).slice(0,20);
  localStorage.setItem(SCORE_KEY, JSON.stringify(a));
  return a;
}
function submitScore(s){
  const arr = loadTop20();
  arr.push(Math.floor(s));
  return saveTop20(arr);
}


// ---------- Background ----------
function drawBackground(){
  const w=window.innerWidth, h=window.innerHeight;
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,biome.sky1);
  g.addColorStop(1,biome.sky2);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  terrain.draw(ctx,scroll);
  return terrain.groundAt(scroll+player.x);
}

// ---------- UI ----------
function drawUI(){
  ctx.fillStyle="#fff";
  ctx.font="700 18px system-ui";
  ctx.fillText(`SCORE ${Math.floor(score)}`,18,34);
  ctx.fillStyle="#ffd54a";
  ctx.fillText(`COIN ${coinCount}`,18,58);

  const pulse=1+(hiFlash>0?0.15:0)+Math.sin(performance.now()*0.002)*0.03;
  ctx.save();
  ctx.translate(window.innerWidth/2,40);
  ctx.scale(pulse,pulse);
  ctx.textAlign="center";
  ctx.font="900 26px system-ui";
  ctx.shadowColor=biome.accent;
  ctx.shadowBlur=18;
  ctx.fillStyle="#fff";
  ctx.fillText(`HI ${highScore}`,0,0);
  ctx.restore();
}

// ---------- Reset / Start ----------
function resetGame(){
  obstacles=[]; coins=[]; particles=[];
  scroll=0; score=0; coinCount=0;
  speed=BASE_SPEED; spawnTimer=0; coinTimer=0;
  playTime=0; lastMinute=0;
  biomeIndex=0; biome=BIOMES[0];
  terrain.resetWithBiome(biome);
  player.reset();
  player.y=terrain.groundAt(player.x);
}
function startGame(){ resetGame(); state=STATE.PLAY; }

// ---------- Main Loop ----------
let last=performance.now();
function loop(now){
  const dt=clamp((now-last)/1000,0,0.033);
  last=now;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if(state===STATE.PLAY){
    playTime+=dt;
    // 15秒ごとにコース切替＆難易度UP
    const m = Math.floor(playTime / 15);
    if (m !== lastMinute) {
      lastMinute = m;
      stage = m; // ステージ = 経過(15秒単位)
      biomeIndex = stage % BIOMES.length;
      biome = BIOMES[biomeIndex];
      terrain.resetWithBiome(biome);
    }

    // ステージが進むほど速度も底上げ（ジワジワ難しく）
    speed = clamp(BASE_SPEED + stage * 55 + score * 0.05, BASE_SPEED, MAX_SPEED);
    scroll+=speed*dt;
    score+=dt*(40+speed*0.04);
  }

  const groundY=drawBackground();

  if(state===STATE.START){
    player.y=groundY; player.update(0,groundY); player.draw(ctx, groundY);
    ctx.fillStyle="rgba(0,0,0,0.45)";
    ctx.fillRect(0,0,window.innerWidth,window.innerHeight);
    ctx.fillStyle="#fff";
    ctx.font="800 42px system-ui";
    ctx.fillText("ABラン",40,window.innerHeight*0.4);
    ctx.font="700 20px system-ui";
    ctx.fillText("Enter / Tap でスタート",40,window.innerHeight*0.4+60);
    if(input.startPressed){ input.startPressed=false; startGame(); }
    requestAnimationFrame(loop); return;
  }

    if(state===STATE.END){
    player.draw(ctx, groundY);
    obstacles.forEach(o=>o.draw(ctx));
    coins.forEach(c=>c.draw(ctx));
    drawUI();

    ctx.fillStyle="rgba(0,0,0,0.55)";
    ctx.fillRect(0,0,window.innerWidth,window.innerHeight);

    ctx.fillStyle="#fff";
    ctx.font="900 44px system-ui";
    ctx.fillText("GAME OVER",40,window.innerHeight*0.4);

    ctx.font="700 20px system-ui";
    ctx.fillText("Enter / Tap でリトライ",40,window.innerHeight*0.4+60);

    // --- TOP20 表示 ---
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "800 18px system-ui";
    ctx.fillText("TOP 20", 40, window.innerHeight*0.4 + 100);

    ctx.font = "600 16px system-ui";
    const baseY = window.innerHeight*0.4 + 128;
    const leftX = 40;
    const rightX = 220;

    for (let i=0; i<top20.length; i++) {
      const col = (i < 10) ? 0 : 1;
      const row = i % 10;
      const x = col === 0 ? leftX : rightX;
      const y = baseY + row * 18;
      ctx.fillText(`${String(i+1).padStart(2," ")}. ${top20[i]}`, x, y);
    }

    // ★ここで入力処理（forの外！）
    if(input.startPressed){
      input.startPressed = false;
      startGame();
      requestAnimationFrame(loop);
      return;
    }

    requestAnimationFrame(loop);
    return;
  }

  // --- PLAY UPDATE ---
  spawnTimer -= dt;
if (spawnTimer <= 0) {
  // ★難易度：ステージが上がるほど間隔が短く（ただし下限あり）
  const interval = clamp(1.05 - stage * 0.045, 0.38, 1.05);

  // ★難易度：サイズも少しずつ大きく（上限あり）
  const difficultyScale = clamp(1 + stage * 0.045, 1, 1.9);

  // バイオームのプールから選ぶ（空中はairRateで）
  const wantAir = Math.random() < clamp(biome.airRate + stage * 0.01, 0.18, 0.65);

  // poolから「air/ground」条件に合うものを抽選
  const pool = biome.pool.slice();
  let tries = 0, pick = pool[Math.floor(rand(0, pool.length))];
  while (tries++ < 8) {
    const cand = pool[Math.floor(rand(0, pool.length))];
    const kind = (OB_CATALOG[cand]?.kind || "ground");
    if ((wantAir && kind === "air") || (!wantAir && kind === "ground")) { pick = cand; break; }
  }

  obstacles.push(new Obstacle(window.innerWidth + rand(40, 140), pick, difficultyScale));

  // ★たまに連続（ステージ後半だけ）
  if (stage >= 4 && Math.random() < 0.20) {
    obstacles.push(new Obstacle(window.innerWidth + rand(170, 260), pick, difficultyScale * 0.95));
  }

  spawnTimer = interval;
}

  coinTimer-=dt;
  if(coinTimer<=0){
    const baseY=groundY-rand(120,200);
    const startX=window.innerWidth+rand(80,180);
    const n=Math.floor(rand(3,7));
    for(let i=0;i<n;i++) coins.push(new Coin(startX+i*26,baseY));
    coinTimer=rand(1.1,1.8);
  }

  player.update(dt,groundY);
  obstacles.forEach(o=>o.update(dt,speed));
  obstacles=obstacles.filter(o=>o.x>-100);
  coins.forEach(c=>c.update(dt,speed));
  coins=coins.filter(c=>c.x>-50&&!c.collected);
  particles.forEach(p=>p.update(dt));
  particles=particles.filter(p=>p.life>0);

  
  const pr = player.getHitRect();
  for (const o of obstacles) {
    if (aabb(pr, o.hitRect())) {

      state = STATE.END;

      // 従来のHIも残す
      if (score > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem("runner_highscore", String(highScore));
        hiFlash = 0.8;
      }

      // ★Top20更新
      top20 = submitScore(score);

      break;
    }
  }

  for(const c of coins){
    if(!c.collected && aabb(pr,c.rect())){
      c.collected=true;
      coinCount++; score+=50;
      for(let i=0;i<10;i++) particles.push(new Particle(c.x,c.y,"#ffd54a"));
    }
  }

  obstacles.forEach(o=>o.draw(ctx));
  coins.forEach(c=>c.draw(ctx));
  player.draw(ctx, groundY);
  particles.forEach(p=>p.draw(ctx));
  drawUI();

  if(hiFlash>0) hiFlash-=dt;
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
