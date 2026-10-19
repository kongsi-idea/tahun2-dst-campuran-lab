/* 分离大法实验室 · 画面：素材载入、碗／盘／烧杯里的内容物（程序绘制并裁在容器内）、玻璃高光重贴、粒子。
   统一左上光源：阴影落在右下，高光在左上。 */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { W, H, GEO } = LAB;
  const { BOWL, DISH, BEAK } = GEO;
  const TAU = Math.PI * 2;
  const CS = 2;                       // 离屏缓存的分辨率倍数
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  Object.assign(LAB, { rand, clamp, lerp, smooth, pick, shuffle, CS });

  /* ───────── 素材 ───────── */
  const A = LAB.A = {};
  LAB.loadAssets = function () {
    const jobs = [['bg', 'bg.jpg'], ['bgCups', 'bg-cups.jpg'], ['texSand', 'tex-sand.jpg'], ['texPowder', 'tex-powder.jpg'], ['texFlour', 'tex-flour.jpg'],
      ['tool_addwater', 'tools/tool-addwater.png'], ['tool_cup', 'tools/tool-cup.png'], ['spoon', 'tools/spoon.png']];
    LAB.TOOLS.forEach((t) => { if (t.key !== 'hand') jobs.push(['tool_' + t.key, `tools/tool-${t.key}.png`]); });
    ['open', 'grab', 'point'].forEach((k) => jobs.push(['hand_' + k, `tools/hand-${k}.png`]));   // 手掌朝下的手：悬停／抓住／食指朝下
    const fam = LAB.FAM = { nail: 8, leaf: 4, stone: 6, bean: 8, salt: 6, peanut: 8, clip: 8, twig: 5, coin: 6, button: 7, pebble: 12, bigstone: 5 };
    for (const k in fam) for (let i = 1; i <= fam[k]; i++) jobs.push([k + i, `items/${k}-${i}.png`]);
    const loadOne = (key, src, tries) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { A[key] = im; res(); };
      im.onerror = () => (tries > 0 ? setTimeout(() => loadOne(key, src, tries - 1).then(res, rej), 400) : rej(new Error('素材载入失败：' + src)));
      im.src = 'assets/' + src;
    });
    return Promise.all(jobs.map(([key, src]) => loadOne(key, src, 3))).then(() => { makePatterns(); for (let i = 1; i <= 8; i++) { measureNail('nail' + i, A['nail' + i]); measureNail('clip' + i, A['clip' + i]); } ['open', 'grab', 'point'].forEach((k) => measureTip(k, A['hand_' + k])); });
  };

  /* 手的指尖：取最底下几行不透明像素的 x 平均，换姿势时以指尖底部中点对齐（三张图宽度不同） */
  const TIP = LAB.TIP = {};
  function measureTip(k, img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let bot = c.height - 1; while (bot > 0) { let hit = false; for (let x = 0; x < c.width; x++) if (d[(bot * c.width + x) * 4 + 3] > 128) { hit = true; break; } if (hit) break; bot--; }
    let n = 0, sx = 0;
    for (let y = bot - 5; y <= bot; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) { n++; sx += x; }
    TIP[k] = { x: (n ? sx / n : c.width / 2) / c.width, y: (bot + 1) / c.height };
  }
  /* 画手：(tx, ty) 是指尖，h 是整张图的显示高度 */
  LAB.drawHand = function (ctx, pose, tx, ty, h, alpha) {
    const im = A['hand_' + pose], tp = TIP[pose], s = h / im.height, w = im.width * s;
    ctx.save(); if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(im, tx - tp.x * w, ty - tp.y * h, w, h); ctx.restore();
  };

  /* 细料材质：缩到 33%，上下左右镜像拼成无缝块，和底色混合降低对比 */
  const PAT = LAB.PAT = {};
  function makePatterns() {
    const mk = (tex, base, n) => {
      n = n || 264;
      const c = document.createElement('canvas'); c.width = c.height = n * 2;
      const g = c.getContext('2d');
      g.drawImage(tex, 0, 0, n, n);
      g.save(); g.translate(n * 2, 0); g.scale(-1, 1); g.drawImage(tex, 0, 0, n, n); g.restore();
      g.save(); g.translate(0, n * 2); g.scale(1, -1); g.drawImage(tex, 0, 0, n, n); g.restore();
      g.save(); g.translate(n * 2, n * 2); g.scale(-1, -1); g.drawImage(tex, 0, 0, n, n); g.restore();
      return { canvas: c, base };
    };
    PAT.sand = mk(A.texSand, '#c9a772', 264); PAT.powder = mk(A.texPowder, '#eadfc9', 300);
    PAT.flour = mk(A.texFlour, '#f0ebe0', 300);
    // 盐粒层：白色小方块，亮、有一点右下的影；可以单独淡出（盐溶解）。和沙混在一起时叠在沙的材质上面
    const n2 = 528, sc = document.createElement('canvas'); sc.width = sc.height = n2;
    const g = sc.getContext('2d'); let sd = 41; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2300; i++) {
      const x = r() * n2, y = r() * n2, w = 2.6 + r() * 2.6;
      g.fillStyle = 'rgba(70,50,25,0.32)'; g.fillRect(x + 0.8, y + 1, w, w * 0.85);
      g.fillStyle = r() < 0.3 ? '#fffefa' : '#f4f8fb'; g.fillRect(x, y, w, w * 0.85);
    }
    PAT.saltDots = { canvas: sc };
  }
  /* 用底色 + 半透明材质填满当前路径（调用前先 clip 或 fill 好形状）。ox/oy 是材质平铺的原点 */
  function fillFine(ctx, kind, x, y, w, h, saltA) {
    const pk = kind === 'sandsalt' ? 'sand' : kind, p = PAT[pk] || PAT.sand;
    ctx.fillStyle = p.base; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.globalAlpha = pk === 'powder' || pk === 'flour' ? 0.26 : 0.5; ctx.fillStyle = ctx.createPattern(p.canvas, 'repeat'); ctx.fillRect(x, y, w, h); ctx.restore();
    if (kind === 'sandsalt' && (saltA == null || saltA > 0.01)) { ctx.save(); ctx.globalAlpha = saltA == null ? 1 : saltA; ctx.fillStyle = ctx.createPattern(PAT.saltDots.canvas, 'repeat'); ctx.fillRect(x, y, w, h); ctx.restore(); }
  }
  LAB.fillFine = fillFine;

  /* 每根铁钉的长轴角度、长度、钉帽方向（不透明像素主成分分析，沿用试作做法） */
  const AXIS = {};
  function measureNail(k, img) {      // k＝'nail3'、'clip5' 这样的键
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    const pts = [];
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      if (d[(y * c.width + x) * 4 + 3] > 128) { n++; sx += x; sy += y; pts.push(x, y); }
    }
    const mx = sx / n, my = sy / n;
    for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - mx, dy = pts[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { const p = (pts[i] - mx) * ux + (pts[i + 1] - my) * uy; lo = Math.min(lo, p); hi = Math.max(hi, p); }
    let a = 0, b = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const p = (pts[i] - mx) * ux + (pts[i + 1] - my) * uy;
      if (p < lo + (hi - lo) * 0.2) a++; else if (p > hi - (hi - lo) * 0.2) b++;
    }
    AXIS[k] = { ang, len: hi - lo, headAng: b > a ? ang : ang + Math.PI };
  }
  LAB.AXIS = AXIS;

  /* ───────── 路径 ───────── */
  function bowlPoly(extra, bottomExtra) {
    const p = new Path2D();
    const y0 = BOWL.rimY, y1 = BOWL.bottomY + (bottomExtra || 0);
    const pts = [];
    for (let y = y0; y < y1; y += 4) pts.push([y, BOWL.hwAt(Math.min(y, BOWL.bottomY)) + extra]);
    pts.push([y1, 0]);
    p.moveTo(BOWL.cx - pts[0][1], pts[0][0]);
    for (const [y, hw] of pts) p.lineTo(BOWL.cx - hw, y);
    for (let i = pts.length - 1; i >= 0; i--) p.lineTo(BOWL.cx + pts[i][1], pts[i][0]);
    p.closePath();
    return p;
  }
  BOWL.pathIn = bowlPoly(0, 0);
  BOWL.pathOut = bowlPoly(BOWL.wall, 12 * LAB.KY || 12);
  function rrPath(l, t, r, b, rad) {
    const p = new Path2D();
    p.moveTo(l, t); p.lineTo(r, t); p.lineTo(r, b - rad);
    p.quadraticCurveTo(r, b, r - rad, b); p.lineTo(l + rad, b);
    p.quadraticCurveTo(l, b, l, b - rad); p.closePath();
    return p;
  }
  BEAK.pathIn = rrPath(BEAK.inL, BEAK.rimY, BEAK.inR, BEAK.inBottom, BEAK.inCorner);
  BEAK.pathOut = rrPath(BEAK.outL, BEAK.rimY, BEAK.outR, BEAK.outBottom, BEAK.outCorner);
  function ellPath(cx, cy, rx, ry) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); return p; }
  BOWL.ringOuter = ellPath(BOWL.cx, BOWL.rimY, BOWL.rimOutRx, BOWL.rimOutRy);
  BOWL.ringInner = ellPath(BOWL.cx, BOWL.rimInY, BOWL.rimInRx, BOWL.rimInRy);
  BEAK.ringOuter = ellPath(BEAK.cx, BEAK.rimY, BEAK.rimOutRx, BEAK.rimOutRy);
  BEAK.ringInner = ellPath(BEAK.cx, BEAK.rimY - 1, BEAK.rimInRx, BEAK.rimInRy);
  DISH.inner = ellPath(DISH.cx, DISH.cy, DISH.inRx, DISH.inRy);
  DISH.outer = ellPath(DISH.cx, DISH.outCy, DISH.outRx, DISH.outRy);

  /* ───────── 状态 ───────── */
  const S = LAB.S = {
    mix: null, items: [],
    bowl: { base: null, water: null, specks: [], baseDirty: true },
    dish: { items: [], fine: null, liquid: null, salt: 0, glintT: 0 },
    beaker: { lv: 0, salty: false },
    glow: null, fx: [], sunLight: 0, shake: 0,
  };
  const GRAIN = {
    sand: ['#c9a46c', '#b88f58', '#dcc08b', '#a77d48', '#e3cc9c'],
    powder: ['#f5efe2', '#e9e0cc', '#fffaf0', '#ddd2bb'],
    mud: ['#a98456', '#8d6b3f', '#c2a070'],
    salt: ['#ffffff', '#eef4f8', '#dbe6ee'],
    flour: ['#fbf8f0', '#efe9db', '#ffffff', '#e4dccb'],
    sandsalt: ['#c9a46c', '#ffffff', '#b88f58', '#eef4f8', '#dcc08b', '#ffffff'],
  };
  LAB.GRAIN = GRAIN;

  /* 碗里底料的离屏画布（世界座标，范围 BCX.. BCY..） */
  const BCW = 700, BCH = 340, BCX = BOWL.cx - 350, BCY = 380;
  const BC = document.createElement('canvas'); BC.width = BCW * CS; BC.height = BCH * CS;
  const bctx = BC.getContext('2d');

  function surfEllipse(top, hw) { const rx = hw - 1; return { rx, ry: rx * BOWL.ratio }; }
  const baseTopNow = (b) => lerp(BOWL.floorY + 14, b.top, b.amount);

  const POWDER_BUMPS = [], POWDER_GRAIN = [];
  (() => { let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 22; i++) POWDER_BUMPS.push({ u: (r() - 0.5) * 1.7, v: (r() - 0.5) * 1.6, r: 22 + r() * 40, k: 0.2 + r() * 0.15 });
    for (let i = 0; i < 3600; i++) POWDER_GRAIN.push([(r() - 0.5) * 640, -26 + r() * 280, 1 + r() * 1.3, r() < 0.5 ? 1 : 0]);
  })();
  function renderBase() {
    const b = S.bowl.base;
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, BC.width, BC.height);
    S.bowl.baseDirty = false;
    if (!b || b.amount < 0.02) return;
    const top = baseTopNow(b);
    const hw = BOWL.hwAt(top), e = surfEllipse(top, hw);
    const powder = b.tex === 'powder' || b.tex === 'flour';
    bctx.save();
    bctx.setTransform(CS, 0, 0, CS, -BCX * CS, -BCY * CS);
    bctx.clip(BOWL.pathIn);
    const fp = new Path2D();
    if (powder) {       // 奶粉顶面轮廓不规则：沿椭圆加一点起伏，不像液面那么整齐
      for (let a = 0; a <= TAU + 0.01; a += 0.07) {
        const n1 = Math.sin(a * 3 + 1) * 0.012 + Math.sin(a * 7 + 2) * 0.008, n2 = Math.sin(a * 5 + 0.5) * 2.2 + Math.sin(a * 11) * 1.2;
        const px = BOWL.cx + e.rx * (1 + n1) * Math.cos(a), py = top + e.ry * Math.sin(a) + n2;
        a === 0 ? fp.moveTo(px, py) : fp.lineTo(px, py);
      }
      fp.closePath();
    } else fp.ellipse(BOWL.cx, top, e.rx, e.ry, 0, 0, TAU);
    fp.rect(BOWL.cx - 400, top + 4, 800, 400);
    bctx.clip(fp);
    fillFine(bctx, b.tex, BOWL.cx - 400, top - 60, 800, 500, b.salt);
    // 前壁暗部：越往下越暗，靠近两侧玻璃也暗（光从左上来，右侧更暗）
    const g = bctx.createLinearGradient(0, top, 0, BOWL.bottomY);
    g.addColorStop(0, powder ? 'rgba(120,110,140,0.12)' : 'rgba(120,75,25,0.14)');
    g.addColorStop(1, powder ? 'rgba(90,80,115,0.5)' : 'rgba(95,55,15,0.46)');
    bctx.fillStyle = g; bctx.fillRect(BOWL.cx - 400, top, 800, 400);
    const gx = bctx.createLinearGradient(BOWL.cx - hw, 0, BOWL.cx + hw, 0);
    gx.addColorStop(0, 'rgba(60,35,10,0.22)'); gx.addColorStop(0.16, 'rgba(60,35,10,0)');
    gx.addColorStop(0.7, 'rgba(60,35,10,0)'); gx.addColorStop(1, 'rgba(40,22,5,0.42)');
    bctx.fillStyle = gx; bctx.fillRect(BOWL.cx - 400, top, 800, 400);
    // 表面：略亮，有一条前缘细影
    bctx.beginPath(); bctx.ellipse(BOWL.cx, top, e.rx, e.ry, 0, 0, TAU);
    const sg = bctx.createRadialGradient(BOWL.cx - e.rx * 0.35, top - e.ry * 0.4, 4, BOWL.cx, top, e.rx);
    sg.addColorStop(0, powder ? 'rgba(255,250,238,0.18)' : 'rgba(255,248,228,0.42)'); sg.addColorStop(1, powder ? 'rgba(255,248,232,0.06)' : 'rgba(255,244,214,0.16)');
    bctx.fillStyle = sg; bctx.fill();
    if (powder) {
      // 哑光粉末：顶面有不规则的小隆起（左上亮、右下有影），整体加颗粒，没有镜面反光
      for (const m of POWDER_BUMPS) {
        const bx = BOWL.cx + m.u * e.rx, by = top + m.v * e.ry;
        for (const [dx, dy, col, a] of [[8, 2.5, '150,138,120', 0.2], [-3, -1, '255,253,244', 0.42]]) {
          const rg = bctx.createRadialGradient(bx + dx, by + dy, 0, bx + dx, by + dy, m.r);
          rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
          bctx.save(); bctx.translate(bx + dx, by + dy); bctx.scale(1, m.k); bctx.translate(-(bx + dx), -(by + dy));
          bctx.fillStyle = rg; bctx.beginPath(); bctx.arc(bx + dx, by + dy, m.r, 0, TAU); bctx.fill(); bctx.restore();
        }
      }
      for (const q of POWDER_GRAIN) { bctx.fillStyle = q[3] ? 'rgba(255,255,250,0.55)' : 'rgba(125,110,90,0.2)'; bctx.fillRect(BOWL.cx + q[0], top + q[1], q[2], q[2]); }
    } else {
      bctx.beginPath(); bctx.ellipse(BOWL.cx, top, e.rx, e.ry, 0, 0.05, Math.PI - 0.05);
      bctx.strokeStyle = 'rgba(90,55,20,0.4)'; bctx.lineWidth = 2.2; bctx.stroke();
    }
    bctx.restore();
  }
  LAB.renderBase = renderBase;

  /* ───────── 物件 ───────── */
  const SIZE = { nail: 115, leaf: 138, stone: 92, bean: 70, peanut: 74, clip: 84, coin: 62, twig: 150, button: 70, pebble: 28, bigstone: 112 };
  const ELONG = { nail: 1, clip: 1 };                 // 长条形的东西：量过长轴方向，磁铁吸起来朝上、倒出来时顺着轴摆
  /* 各种东西在浅盘、筛子、滤纸里的缩放（相对它在碗里的大小） */
  const DISH_SC = { leaf: 0.5, stone: 0.58, nail: 0.62, bean: 0.78, peanut: 0.78, clip: 0.66, coin: 0.72, twig: 0.46, button: 0.74, pebble: 1.1, bigstone: 0.5 };
  const HEAP_SC = { nail: 0.46, leaf: 0.4, stone: 0.5, bean: 0.62, peanut: 0.62, clip: 0.52, coin: 0.62, twig: 0.4, button: 0.62, pebble: 1.0, bigstone: 0.46 };
  Object.assign(LAB, { ELONG, DISH_SC, HEAP_SC, SIZE });
  function makeItem(kind, k, x, y, depth, opt) {
    const img = A[kind + k];
    const it = { kind, k, img, x, y, depth, state: 'rest', rot: 0, squash: 1, jx: 0, jy: 0, covA: 1, z: 0, home: { x, y }, alpha: 1 };
    if (ELONG[kind]) {
      const ax = AXIS[kind + k]; const s = SIZE[kind] / ax.len;
      it.ax = ax; it.elong = true; it.w = img.width * s; it.h = img.height * s; it.len = SIZE[kind];
    } else {
      const s = (opt && opt.size || SIZE[kind]) / Math.max(img.width, img.height);
      it.w = img.width * s; it.h = img.height * s; it.len = Math.max(it.w, it.h); it.ax = { ang: 0, len: it.len, headAng: 0 };
    }
    Object.assign(it, opt || {});
    return it;
  }
  LAB.makeItem = makeItem;

  function bake(it) {
    const c = Math.cos(it.rot), s = Math.sin(it.rot);
    const bw = Math.ceil(Math.abs(c) * it.w + Math.abs(s) * it.h + 24);
    const bh = Math.ceil((Math.abs(s) * it.w + Math.abs(c) * it.h) * it.squash + 24);
    it.bw = bw; it.bh = bh;
    const sp = document.createElement('canvas'); sp.width = bw * CS; sp.height = bh * CS;
    const g = sp.getContext('2d'); g.scale(CS, CS);
    // 接触阴影：右下
    const small = it.kind === 'pebble', sr = it.len * (small ? 0.66 : 0.5);       // 小石头的接触阴影加重：像落在碗底，不像贴纸
    const sh = g.createRadialGradient(bw / 2 + 4, bh / 2 + 7 * it.squash, 0, bw / 2 + 4, bh / 2 + 7 * it.squash, sr);
    sh.addColorStop(0, small ? 'rgba(40,22,4,0.62)' : 'rgba(50,28,6,0.38)'); sh.addColorStop(1, 'rgba(50,28,6,0)');
    g.save(); g.translate(bw / 2 + 4, bh / 2 + 7 * it.squash); g.scale(1, 0.2 + 0.18 * it.squash);
    g.translate(-(bw / 2 + 4), -(bh / 2 + 7 * it.squash)); g.fillStyle = sh;
    g.beginPath(); g.arc(bw / 2 + 4, bh / 2 + 7 * it.squash, sr, 0, TAU); g.fill(); g.restore();
    g.translate(bw / 2, bh / 2); g.scale(1, it.squash); g.rotate(it.rot);
    g.drawImage(it.img, -it.w / 2, -it.h / 2, it.w, it.h);
    if (it.depth === 'side') {      // 埋在沙里的：整体蒙一层沙色，看起来在沙里面，不是浮在玻璃外
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = it.veil || 'rgba(190,150,95,0.4)'; g.fillRect(0, 0, sp.width, sp.height);
      g.globalCompositeOperation = 'source-over';
    }
    it.spr = sp; it.cov = null;
    if (it.depth === 'half' || it.depth === 'side') {
      const cv = document.createElement('canvas'); cv.width = bw * CS; cv.height = bh * CS;
      const cg = cv.getContext('2d');
      cg.drawImage(BC, (it.x - bw / 2 - BCX) * CS, (it.y - bh / 2 - BCY) * CS, bw * CS, bh * CS, 0, 0, bw * CS, bh * CS);
      const m = document.createElement('canvas'); m.width = bw * CS; m.height = bh * CS;
      const mg = m.getContext('2d'); mg.scale(CS, CS);
      let ang, cx0 = bw / 2, cy0 = bh * (it.depth === 'half' ? 0.46 : 0.5);
      ang = it.depth === 'half' ? Math.PI / 2 : (Math.random() < 0.5 ? 1 : -1) * rand(0.45, 1.1) + Math.PI / 2;
      const nx = Math.cos(ang), ny = Math.sin(ang);                 // 遮住的一侧朝 (nx, ny)
      if (it.depth === 'side') { cx0 += rand(-8, 8); cy0 += rand(-6, 6); }
      const gr = mg.createLinearGradient(cx0 - nx * 7, cy0 - ny * 7, cx0 + nx * 7, cy0 + ny * 7);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      mg.fillStyle = gr; mg.fillRect(0, 0, bw, bh);
      // 边缘凹凸：沿切线撒几团柔边圆
      const tx = -ny, ty = nx, span = Math.hypot(bw, bh) * 0.5;
      for (let i = 0; i < 9; i++) {
        const u = rand(-span, span), r = rand(7, 15), off = rand(-5, 3);
        const px = cx0 + tx * u - nx * off, py = cy0 + ty * u - ny * off;
        const rg = mg.createRadialGradient(px, py, 0, px, py, r);
        rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.9)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        mg.fillStyle = rg; mg.beginPath(); mg.arc(px, py, r, 0, TAU); mg.fill();
      }
      cg.globalCompositeOperation = 'destination-in'; cg.drawImage(m, 0, 0);
      it.cov = cv;
    }
  }
  LAB.bake = bake;

  /* 把物件画成「在原地躺着」的样子（用烘好的图），jx/jy 是抖动位移 */
  function drawRest(ctx, it, alphaMul) {
    if (!it.spr) return;
    const a = (it.alpha == null ? 1 : it.alpha) * (alphaMul == null ? 1 : alphaMul);
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.drawImage(it.spr, it.x + it.jx - it.bw / 2, it.y + it.jy - it.bh / 2, it.bw, it.bh);
    if (it.cov && it.covA > 0.01) {
      ctx.globalAlpha = a * it.covA * (S.bowl.base ? S.bowl.base.alpha : 1);
      ctx.drawImage(it.cov, it.x + it.jx - it.bw / 2, it.y + it.jy - it.bh / 2, it.bw, it.bh);
    }
    ctx.globalAlpha = 1;
  }

  /* 原始图（飞行、被拿起、浮起来时用）：scale、squash 可动态 */
  function drawRaw(ctx, it, x, y, rot, sc, squash, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y); ctx.scale(sc, sc * (squash == null ? 1 : squash)); ctx.rotate(rot);
    ctx.drawImage(it.img, -it.w / 2, -it.h / 2, it.w, it.h);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  LAB.drawRaw = drawRaw;

  function softShadow(ctx, x, y, rx, ry, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(60,35,10,${a})`); g.addColorStop(1, 'rgba(60,35,10,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  LAB.softShadow = softShadow;

  /* ───────── 建立混合物 ───────── */
  LAB.findMix = (id) => LAB.MIXES.find((m) => m.id === id) || LAB.VMIX[id] || null;
  LAB.resetMix = function (id) {
    const mx = LAB.findMix(id) || { id: 'empty', name: '', base: null, water: null, kinds: {} };     // 'empty'：刚进页面，碗是空的，学生点了混合物卡才有东西
    S.mix = mx; S.items = []; S.fx = []; S.glow = null; S.sunLight = 0; S.shake = 0; S.cups = null; S.fixtures = [];
    S.dish = { items: [], fine: null, liquid: null, salt: 0, glintT: 0, puddles: null };
    S.beaker = { lv: 0, salty: false };
    S.bowl.specks = [];
    S.bowl.base = null; S.bowl.water = null;
    const cx = BOWL.cx;
    if (mx.base) {
      const top = mx.water === 'saltclear' ? 606 : mx.water ? 628 : BOWL.sandTop;
      S.bowl.base = { tex: mx.base, top, home: top, amount: 1, alpha: 1, salt: mx.base === 'sandsalt' ? 1 : 0 };
    }
    if (mx.water) {
      const wy = mx.water === 'saltclear' ? BOWL.waterTop - 4 : BOWL.waterTop + 8;
      S.bowl.water = { y: wy, home: wy, tint: mx.water === 'muddy' ? 'muddy' : 'clear', mud: mx.water === 'muddy' ? 1 : 0, milk: mx.water === 'milky' ? 1.25 : 0, amount: 1, speckA: 0 };
      if (mx.water === 'muddy') { S.bowl.water.speckA = 0.55; for (let i = 0; i < 90; i++) S.bowl.specks.push({ x: cx + rand(-280, 280), y: rand(470, 640), vx: rand(-4, 4), vy: rand(-3, 3), r: rand(1.2, 2.8), c: pick(GRAIN.mud) }); }
      if (mx.water === 'milky') { S.bowl.water.speckA = 0.5; for (let i = 0; i < 80; i++) S.bowl.specks.push({ x: cx + rand(-280, 280), y: rand(470, 640), vx: rand(-4, 4), vy: rand(-3, 3), r: rand(1, 2.2), c: pick(GRAIN.flour) }); }
    }
    renderBase();
    const topY = S.bowl.base ? S.bowl.base.top : 0;
    const ell = surfEllipse(topY, BOWL.hwAt(topY));
    if (mx.layout === 'embed') for (const kind in mx.kinds) buildSurfaceItems(kind, mx.kinds[kind].n, ell, topY, famIdx(kind));
    else if (mx.layout === 'pile') buildPile(mx.id);
    else if (mx.layout === 'floor') buildFloor();
    S.items.forEach(bake);
    sortItems();
  };
  const famIdx = (kind) => { const n = LAB.FAM[kind], a = []; for (let i = 1; i <= n; i++) a.push(i); return a; };

  function sortItems() { S.items.sort((a, b) => (a.z - b.z) || (a.y - b.y)); }
  LAB.sortItems = sortItems;

  const VEIL = { peanut: 'rgba(240,234,222,0.42)', clip: 'rgba(240,234,222,0.42)' };      // 埋在面粉里的东西蒙一层面粉色
  function buildSurfaceItems(kind, n, ell, top, ks) {
    const cx = BOWL.cx;
    const vis = shuffle([].concat(Array(n.surf).fill('surf'), Array(n.half).fill('half')));
    const slots = vis.length;
    const kk = shuffle(ks.slice());
    let ki = 0;
    // 表面、半埋：分前后两排沿表面椭圆撒开（椭圆很扁，一排放不下），排内等距、略有抖动
    const rows = [Math.ceil(slots / 2), Math.floor(slots / 2)];
    const pos = [];
    rows.forEach((cnt, r) => {
      for (let i = 0; i < cnt; i++) {
        const u = lerp(-0.8, 0.8, cnt === 1 ? 0.5 : i / (cnt - 1)) + (r ? 0.5 / Math.max(1, cnt) : 0) * (cnt > 1 ? 1 : 0) - (r ? 0.12 : 0);
        const x = u * ell.rx + rand(-8, 8), edge = Math.sqrt(Math.max(0.1, 1 - Math.pow(x / ell.rx, 2)));
        pos.push({ x, y: (r ? 0.38 : -0.36) * ell.ry * edge + rand(-2, 2) });
      }
    });
    shuffle(pos);
    vis.forEach((d, i) => {
      const x = cx + pos[i].x, yy = top + pos[i].y;
      const it = makeItem(kind, kk[ki++ % kk.length], x, yy, d, { squash: ELONG[kind] ? 0.72 : 0.78, veil: VEIL[kind] });
      it.rot = it.elong ? rand(-0.3, 0.3) + (Math.random() < 0.5 ? 0 : Math.PI) - it.ax.ang : rand(0, TAU);
      it.restRot = it.rot; it.z = 1;
      S.items.push(it);
    });
    // 侧面：贴在前壁玻璃上，被底料遮住一半
    const sideXs = shuffle([-205, 195, 0, -100, 105]);
    for (let i = 0; i < n.side; i++) {
      const x = cx + sideXs[i % 5] + rand(-16, 16);
      const y = top + 62 + (i % 3) * 38 + rand(-8, 8);
      const it = makeItem(kind, kk[ki++ % kk.length], x, y, 'side', { squash: 1, veil: VEIL[kind] });
      it.rot = rand(0, TAU) - (it.elong ? it.ax.ang : 0); it.restRot = it.rot; it.z = 0;
      if (kind === 'bean') { it.w *= 1.05; it.h *= 1.05; }
      S.items.push(it);
    }
    // 完全埋住：画不出来（藏在底料里），磁铁／筛子／倒出时才冒出来
    for (let i = 0; i < n.bury; i++) {
      const x = cx + rand(-0.7, 0.7) * ell.rx, y = top + rand(0.0, 0.5) * ell.ry;
      const it = makeItem(kind, kk[ki++ % kk.length], x, y, 'bury', { squash: ELONG[kind] ? 0.72 : 0.78 });
      it.rot = it.elong ? rand(-0.4, 0.4) - it.ax.ang : rand(0, TAU); it.restRot = it.rot; it.z = 1; it.hidden = true;
      S.items.push(it);
    }
  }

  /* 堆在碗底的东西：没有细料，大块东西堆在一起，靠前后遮挡产生「混在里面」。
     slot：[种类, dx, dy(相对碗底), 层 z, depth, 角度] */
  const PILES = {
    leafstone: [
      ['leaf', -120, -95, 0, 'bury', 0.5], ['leaf', 60, -80, 0, 'side', -0.4],
      ['stone', -190, -14, 1, 'side', 0], ['stone', -95, -22, 1, 'surf', 0], ['stone', -5, -16, 1, 'half', 0],
      ['stone', 90, -24, 1, 'surf', 0], ['stone', 180, -12, 1, 'half', 0],
      ['leaf', -150, -62, 2, 'half', -0.25], ['leaf', 20, -60, 2, 'surf', 0.3], ['leaf', 135, -66, 2, 'surf', -0.15],
      ['stone', -45, -78, 3, 'surf', 0],
    ],
    /* 大、小石头：5 块大石头垫底，小石头撒在缝里和前面（小石头只有约 13px，远比碎石小） */
    stones: [
      ['bigstone', -178, -30, 1, 'surf', 0.1], ['bigstone', -30, -38, 1, 'half', -0.12], ['bigstone', 125, -30, 1, 'surf', 0.05],
      ['bigstone', -105, -100, 2, 'surf', 0.08], ['bigstone', 62, -96, 2, 'bury', -0.1],
    ],
    /* 树枝和硬币：硬币放在上层，磁铁够得着 */
    twigcoin: [
      ['twig', -140, -26, 0, 'surf', -0.12], ['twig', 70, -30, 0, 'half', 0.18], ['twig', -20, -92, 2, 'surf', -0.4], ['twig', 150, -78, 2, 'side', 0.45],
      ['coin', -232, -18, 1, 'surf', 0.2], ['coin', -62, -30, 1, 'surf', -0.3], ['coin', 214, -22, 1, 'half', 0.1], ['coin', 22, -66, 3, 'surf', 0.6], ['coin', -150, -86, 3, 'bury', -0.2],
    ],
  };
  function buildPile(id) {
    const cx = BOWL.cx, fy = BOWL.floorY;
    const order = {};
    for (const kind in LAB.FAM) order[kind] = shuffle(famIdx(kind));
    const cnt = {};
    const slots = PILES[id].slice();
    if (id === 'stones') {          // 小石头 36 颗：只放在大石头外面的缝隙和周围（不叠在大石头正面，否则像斑点），散在碗底
      const bigs = slots.filter((q) => q[0] === 'bigstone').map(([, dx, dy]) => ({ x: dx, y: dy - 6, rx: 62, ry: 44 }));      // 大石头在碗底的占位椭圆
      const clear = (x, y) => bigs.every((b) => Math.pow((x - b.x) / (b.rx + 14), 2) + Math.pow((y - b.y) / (b.ry + 10), 2) > 1);
      for (let i = 0, n = 0; i < 36 && n < 900; n++) {
        const dy = -rand(2, 118), span = 262 - (-dy) * 0.95, dx = rand(-span, span);
        if (!clear(dx, dy)) continue;
        i++; slots.push(['pebble', dx, dy, 3, i % 11 === 5 ? 'side' : 'surf', rand(0, TAU)]);
      }
    }
    for (const [kind, dx, dy, z, depth, rot] of slots) {
      cnt[kind] = (cnt[kind] || 0);
      const list = order[kind], k = list[cnt[kind]++ % list.length];
      const it = makeItem(kind, k, cx + dx, fy + dy, depth, { squash: kind === 'pebble' ? 0.8 : 0.9 });
      it.rot = rot + rand(-0.12, 0.12); it.restRot = it.rot; it.z = z;
      if (kind === 'stone' || kind === 'bigstone') { it.w *= rand(0.94, 1.08); it.h *= rand(0.94, 1.08); }
      if (kind === 'pebble') { const k2 = rand(0.86, 1.14); it.w *= k2; it.h *= k2; it.len *= k2; }
      S.items.push(it);
    }
  }
  /* 纽扣沉在水底：七颗散在碗底，前后两排 */
  function buildFloor() {
    const cx = BOWL.cx, fy = BOWL.floorY, ks = shuffle(famIdx('button'));
    const spots = [[-222, -10], [-124, -6], [-22, -12], [82, -7], [184, -11], [-172, -44], [44, -48]];
    spots.forEach(([dx, dy], i) => {
      const it = makeItem('button', ks[i % ks.length], cx + dx + rand(-6, 6), fy + dy, 'surf', { squash: 0.62 });
      it.rot = rand(0, TAU); it.restRot = it.rot; it.z = dy < -30 ? 0 : 1;
      S.items.push(it);
    });
  }

  /* ───────── 浅盘里的东西 ───────── */
  LAB.dishSlot = function (i) {
    const cols = [-125, -62, 0, 62, 125, -95, -32, 32, 95, -155, 155, -60, 0, 60, 120];
    const rows = [0, 0, 0, 0, 0, -9, -9, -9, -9, -3, -3, -15, -15, -15, -13];
    if (i >= 15) { const u = ((i * 0.618) % 1) * 2 - 1, v = ((i * 0.381 + 0.2) % 1) * 2 - 1; return { x: DISH.cx + u * 150, y: DISH.floorCy + v * 12 + 2 }; }      // 东西很多时（小石头）排满整个盘底
    return { x: DISH.cx + cols[i % cols.length], y: DISH.floorCy + rows[i % rows.length] + 4 };
  };
  LAB.dishAdd = function (it) {
    const i = S.dish.items.length, p = LAB.dishSlot(i);
    const sc = DISH_SC[it.kind] || 0.7;
    const d = { img: it.img, kind: it.kind, w: it.w, h: it.h, sc, x: p.x, y: p.y, rot: it.elong ? rand(-0.5, 0.5) - it.ax.ang : rand(0, TAU), z: p.y };
    S.dish.items.push(d); return d;
  };

  /* ───────── 绘制 ───────── */
  function waterColors(w) {
    const mud = w.mud, milk = w.milk;
    return { mud, milk };
  }

  function drawWaterBody(ctx, cx, y, hw, bottom, w, t) {
    const e = surfEllipse(y, hw);
    ctx.save();
    const body = new Path2D(); body.ellipse(cx, y, e.rx, e.ry, 0, 0, TAU); body.rect(cx - 400, y, 800, 500);
    ctx.clip(body);
    const g = ctx.createLinearGradient(0, y - e.ry, 0, bottom);
    const m = w.mud || 0;
    const top = mixRGBA([150, 208, 242, 0.3], [178, 146, 98, 0.5], m), bot = mixRGBA([55, 128, 196, 0.5], [120, 88, 52, 0.74], m);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(cx - 400, y - e.ry, 800, bottom - y + e.ry + 20);
    if (w.milk > 0.01) {
      const a = Math.min(0.9, 0.6 * w.milk), mg = ctx.createLinearGradient(0, y, 0, bottom);       // 越往下越透：沉在底部的那一层面粉看得到
      mg.addColorStop(0, `rgba(250,246,236,${a})`); mg.addColorStop(0.62, `rgba(250,246,236,${a})`); mg.addColorStop(0.9, `rgba(250,246,236,${a * 0.42})`);
      ctx.fillStyle = mg; ctx.fillRect(cx - 400, y - e.ry, 800, bottom - y + e.ry + 20);
    }
    ctx.restore();
    // 水面
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, y, e.rx, e.ry, 0, 0, TAU);
    const sg = ctx.createLinearGradient(cx - e.rx, y - e.ry, cx + e.rx * 0.6, y + e.ry);
    sg.addColorStop(0, m > 0.3 ? 'rgba(220,190,140,0.5)' : 'rgba(235,248,255,0.5)'); sg.addColorStop(1, m > 0.3 ? 'rgba(160,125,80,0.3)' : 'rgba(140,200,240,0.25)');
    ctx.fillStyle = sg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y, e.rx, e.ry, 0, 0.04, Math.PI - 0.04);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, y, e.rx, e.ry, 0, Math.PI + 0.1, TAU - 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 水面高光：左上一条亮弧，随时间轻轻流动
    const sh = Math.sin(t / 900) * 6;
    ctx.beginPath(); ctx.ellipse(cx - e.rx * 0.34 + sh, y - e.ry * 0.18, e.rx * 0.42, e.ry * 0.34, 0, Math.PI * 1.08, Math.PI * 1.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  function mixRGBA(a, b, t) { return `rgba(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0},${(a[3] + (b[3] - a[3]) * t).toFixed(3)})`; }

  function drawBowl(ctx, t) {
    const B = S.bowl;
    if (B.baseDirty) renderBase();
    ctx.save();
    ctx.clip(BOWL.pathIn);
    const base = B.base;
    if (base && base.amount > 0.02 && base.alpha > 0.01) { ctx.globalAlpha = base.alpha; ctx.drawImage(BC, BCX, BCY, BCW, BCH); ctx.globalAlpha = 1; }
    // 沉在水里（或没水时）躺着的物件
    for (const it of S.items) {
      if (it.state === 'rest' && !it.hidden) {
        if (it.revealA) { ctx.globalAlpha = it.revealA; }
        drawRest(ctx, it);
      } else if (it.state === 'rest' && it.hidden && it.jit) {
        // 埋住的东西被磁铁拉得开始动：沙面鼓起一点点
        const e = it.jit; softShadow(ctx, it.x, it.y, 22 + 10 * e, 6, 0.12 * e);
      }
    }
    // 水
    const w = B.water;
    if (w && w.amount > 0.01) {
      drawWaterBody(ctx, BOWL.cx, w.y, BOWL.hwAt(w.y), BOWL.bottomY, w, t);
      // 泥水里漂着的沙粒
      if (B.specks.length) {
        for (const s of B.specks) { ctx.globalAlpha = w.speckA != null ? w.speckA : 0.55 * (w.mud || 0); ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
    if (S.bowlStream) S.bowlStream(ctx, t);
    // 浮起来的东西、被水泡着的悬浮物
    for (const it of S.items) if (it.state === 'float') {
      const sub = w ? clamp((it.y - w.y) / 60, 0, 1) : 0;
      if (!sub && w) softShadow(ctx, it.x + 6, it.y + 8, it.len * 0.42, 6, 0.18);
      drawRaw(ctx, it, it.x, it.y, it.rot, 1, it.squash, 1 - 0.18 * sub);
    }
    // 倒出时从底料里掉出来的、碗里正在飞的东西另外画（不在裁剪里）
    ctx.restore();
  }

  function drawFineMound(ctx, cx, cy, wid, hgt, kind, wet) {
    if (wid < 2 || hgt < 1) return;
    const p = new Path2D();
    p.moveTo(cx - wid, cy);
    p.bezierCurveTo(cx - wid * 0.55, cy - hgt * 1.15, cx + wid * 0.55, cy - hgt * 1.15, cx + wid, cy);
    p.ellipse(cx, cy, wid, wid * 0.16, 0, 0, Math.PI, false);
    ctx.save();
    softShadow(ctx, cx + wid * 0.08, cy + wid * 0.06, wid * 1.05, wid * 0.16, 0.25);
    ctx.clip(p);
    fillFine(ctx, kind, cx - wid, cy - hgt * 1.2, wid * 2, hgt * 1.4 + wid * 0.2);
    const g = ctx.createLinearGradient(cx - wid, cy - hgt, cx + wid, cy);
    g.addColorStop(0, 'rgba(255,248,225,0.28)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, kind === 'powder' || kind === 'flour' ? 'rgba(80,70,110,0.3)' : 'rgba(70,40,10,0.36)');
    ctx.fillStyle = g; ctx.fillRect(cx - wid, cy - hgt * 1.2, wid * 2, hgt * 1.4 + wid * 0.2);
    if (wet > 0.01) { ctx.fillStyle = kind === 'flour' || kind === 'powder' ? `rgba(120,110,95,${0.3 * wet})` : `rgba(70,42,14,${0.38 * wet})`; ctx.fillRect(cx - wid, cy - hgt * 1.2, wid * 2, hgt * 1.4 + wid * 0.2); }   // 湿沙颜色深，晒干变浅
    ctx.restore();
  }
  LAB.drawFineMound = drawFineMound;

  function drawDish(ctx, t) {
    const D = S.dish;
    // 细料堆（沙／奶粉）先画，液体盖在上面，这样沙看起来沉在水里
    if (D.fine && D.fine.amt > 0.01) {
      const f = D.fine, a = Math.sqrt(f.amt);
      drawFineMound(ctx, DISH.cx + (f.dx || 0), DISH.floorCy + 3, 38 + 92 * a * (f.wide || 1), 6 + 38 * f.amt * (f.tall || 1), f.kind, f.wet);
    }
    // 内壁阴影（后壁暗一点，增加深度），只在盘子里面
    ctx.save(); ctx.clip(DISH.inner);
    const sg = ctx.createLinearGradient(0, DISH.cy - DISH.inRy, 0, DISH.cy + DISH.inRy);
    sg.addColorStop(0, 'rgba(70,55,80,0.16)'); sg.addColorStop(0.55, 'rgba(70,55,80,0)');
    ctx.fillStyle = sg; ctx.fillRect(DISH.cx - 220, DISH.cy - 40, 440, 80);
    // 液体：随量缩成一块越来越小的水渍
    const L = D.liquid;
    if (L && L.lv > 0.01) {
      const k = Math.sqrt(L.lv), rx = lerp(26, DISH.inRx - 9, k), ry = lerp(5, DISH.inRy - 4, k);
      const cy = DISH.floorCy - 2;
      const m = L.mud || 0, ml = Math.min(1, L.milk || 0);
      const g = ctx.createLinearGradient(DISH.cx - rx, cy - ry, DISH.cx + rx, cy + ry);
      if (ml > 0) { g.addColorStop(0, mixRGBA([190, 226, 248, 0.62], [250, 248, 240, 0.94], ml)); g.addColorStop(1, mixRGBA([110, 176, 226, 0.7], [226, 221, 208, 0.94], ml)); }
      else { g.addColorStop(0, mixRGBA([190, 226, 248, 0.62], [186, 152, 102, 0.8], m)); g.addColorStop(1, mixRGBA([110, 176, 226, 0.7], [130, 98, 60, 0.88], m)); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(DISH.cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(DISH.cx, cy, rx - 1, ry - 1, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(DISH.cx - rx * 0.3 + Math.sin(t / 700) * 4, cy - ry * 0.25, rx * 0.38, ry * 0.38, 0, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
    }
    ctx.restore();
    if (D.salt > 0.01) drawSaltInDish(ctx, D.salt, t);
    if (D.puddles) drawPuddles(ctx, D.puddles, t);
    const items = D.items.slice().sort((a, b) => a.z - b.z);
    for (const d of items) {
      softShadow(ctx, d.x + 4, d.y + 5, d.w * d.sc * 0.4, 5, 0.3);
      ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.sc, d.sc * 0.8); ctx.rotate(d.rot);
      ctx.drawImage(d.img, -d.w / 2, -d.h / 2, d.w, d.h); ctx.restore();
    }
    // 前缘重贴（盘沿在东西前面）
    ctx.save();
    const band = new Path2D(); band.addPath(DISH.outer); band.addPath(DISH.inner);
    const clipLow = new Path2D(); clipLow.rect(0, DISH.cy + 2, W, 120);
    ctx.clip(clipLow); ctx.clip(band, 'evenodd');
    ctx.drawImage(A.bg, 0, 0, W, H);
    ctx.restore();
  }

  /* 蒸发后的盐：浅盘里只留薄薄一层。沿着原来水边一圈白色盐渍，盘底散一些小盐粒，几颗大一点的结晶会反光。没有堆起来的高度（结晶最高几 px）。 */
  const SALT_RX = DISH.inRx - 9, SALT_RY = DISH.inRy - 4, SALT_CY = DISH.floorCy - 2;      // 与水渍最大时的椭圆一致
  const SALT_GRAINS = [], SALT_RING = [];
  (() => { let sd = 23; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.93; SALT_GRAINS.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: 0.9 + r() * 1.9, t: r(), b: r() }); }
    for (let i = 0; i < 150; i++) { const a = (i / 150) * TAU; SALT_RING.push({ a, w: 1.6 + r() * 3.2, o: 0.45 + r() * 0.5, j: (r() - 0.5) * 5 }); }
  })();
  const SALT_BIG = [[-0.62, 0.2, 2, 30], [-0.2, 0.42, 4, 26], [0.32, 0.3, 1, 32], [0.66, 0.08, 5, 24], [0.08, -0.34, 3, 22], [-0.5, -0.38, 6, 20]];
  /* 两杯找盐：浅盘里分 A、B 两块水渍，各自蒸发、各自留下东西（盐粒或面粉）。每块用缩小的整盘盐渍图（clip 也一起缩，所以盐粒不会跑出水渍） */
  function drawPuddles(ctx, list, t) {
    for (const p of list) {
      const cx = DISH.cx + p.dx, cy = DISH.floorCy - 3;
      if (p.lv > 0.01) {
        const kk = Math.sqrt(p.lv), rx = lerp(14, 84, kk), ry = lerp(4, 19, kk);
        ctx.save(); ctx.clip(DISH.inner);
        const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry), ml = Math.min(1, p.milk || 0);
        g.addColorStop(0, mixRGBA([190, 226, 248, 0.62], [250, 248, 240, 0.94], ml)); g.addColorStop(1, mixRGBA([110, 176, 226, 0.7], [226, 221, 208, 0.94], ml));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0.1, Math.PI - 0.1); ctx.stroke();
        ctx.restore();
      }
      if (p.flour > 0.01) drawFineMound(ctx, cx, DISH.floorCy + 3, 14 + 66 * Math.sqrt(p.flour), 3 + 9 * p.flour, 'flour', 0);
      if (p.salt > 0.01) drawPuddleSalt(ctx, cx, cy, p.salt, t);
    }
    ctx.save(); ctx.clip(DISH.inner);
    ctx.font = '900 40px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    for (const p of list) { const x = DISH.cx + p.dx, y = DISH.floorCy + DISH.inRy * 0.66; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(p.label, x, y); ctx.fillStyle = 'rgba(231,134,10,0.95)'; ctx.fillText(p.label, x, y); }
    ctx.textBaseline = 'alphabetic'; ctx.restore();
  }
  /* 有盐那块：一圈清楚的白色盐渍＋盘底一层白＋明显的白色盐粒，几颗大结晶会闪（和盐水蒸发同一套做法，只是画在这一小块里，颗粒更大） */
  function drawPuddleSalt(ctx, cx, cy, s, t) {
    const rx = 84, ry = 19;
    ctx.save(); ctx.clip(DISH.inner);
    const ra = clamp(s * 3, 0, 1);
    for (const q of SALT_RING) {
      const x = cx + Math.cos(q.a) * (rx - 1 + q.j), y = cy + Math.sin(q.a) * (ry - 1 + q.j * 0.2);
      ctx.fillStyle = `rgba(255,255,255,${q.o * ra})`; ctx.beginPath(); ctx.ellipse(x, y, q.w * 1.7, q.w * 0.95, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * ra})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(cx, cy, rx - 3, ry - 1.5, 0, 0, TAU); ctx.stroke();
    const fa = clamp((s - 0.2) / 0.6, 0, 1);
    if (fa > 0) { ctx.fillStyle = `rgba(252,253,255,${0.55 * fa})`; ctx.beginPath(); ctx.ellipse(cx, cy, rx - 8, ry - 3, 0, 0, TAU); ctx.fill(); }
    for (const g of SALT_GRAINS) {
      const a = clamp((s - 0.1 - g.t * 0.6) * 4, 0, 1); if (a <= 0) continue;
      const x = cx + g.x * (rx - 10), y = cy + g.y * (ry - 4), w = 3 + g.s * 1.4;
      ctx.fillStyle = `rgba(90,100,120,${0.35 * a})`; ctx.fillRect(x + 1, y + 1.4, w, w * 0.8);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, w, w * 0.8);
    }
    ctx.restore();
    SALT_BIG.forEach(([ux, uy, k, wid], i) => {
      const a = clamp(s * 1.8 - 0.3 - i * 0.07, 0, 1); if (a <= 0) return;
      const img = A['salt' + k], w2 = wid * 1.15, sc = w2 / img.width, x = cx + ux * (rx - 22), y = cy + uy * (ry - 6);
      softShadow(ctx, x + 3, y + 3, w2 * 0.42, 4, 0.3 * a);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(1, 0.7); ctx.drawImage(img, -img.width * sc / 2, -img.height * sc * 0.72, img.width * sc, img.height * sc); ctx.restore();
      const gl = Math.pow(Math.max(0, Math.sin(t / 650 + i * 2.1)), 10) * a;
      if (gl > 0.05) { ctx.save(); ctx.translate(x - w2 * 0.12, y - 7); ctx.fillStyle = `rgba(255,255,255,${0.95 * gl})`; ctx.fillRect(-1, -9 * gl - 1, 2, 18 * gl + 2); ctx.fillRect(-9 * gl - 1, -1, 18 * gl + 2, 2); ctx.restore(); }
    });
  }
  function drawSaltInDish(ctx, s, t) {
    ctx.save(); ctx.clip(DISH.inner);
    // 1) 水渍边缘：沿原来水边一圈白色盐渍（先出现，因为水边最先干）
    const ra = clamp(s * 3, 0, 1);
    if (ra > 0) {
      for (const q of SALT_RING) {
        const x = DISH.cx + Math.cos(q.a) * (SALT_RX - 1 + q.j), y = SALT_CY + Math.sin(q.a) * (SALT_RY - 1 + q.j * 0.3);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * q.o * ra})`; ctx.beginPath(); ctx.ellipse(x, y, q.w, q.w * 0.6, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * ra})`; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.ellipse(DISH.cx, SALT_CY, SALT_RX - 2, SALT_RY - 1, 0, 0, TAU); ctx.stroke();
    }
    // 2) 盘底一层薄薄的白（半透明，透出盘子的颜色）
    const fa = clamp((s - 0.25) / 0.6, 0, 1);
    if (fa > 0) { ctx.fillStyle = `rgba(250,252,255,${0.3 * fa})`; ctx.beginPath(); ctx.ellipse(DISH.cx, SALT_CY, SALT_RX - 6, SALT_RY - 3, 0, 0, TAU); ctx.fill(); }
    // 3) 散落的小盐粒（有晶粒感：白色小方块，右下一点点影）
    for (const g of SALT_GRAINS) {
      const a = clamp((s - 0.12 - g.t * 0.6) * 4, 0, 1); if (a <= 0) continue;
      const x = DISH.cx + g.x * (SALT_RX - 8), y = SALT_CY + g.y * (SALT_RY - 4);
      ctx.fillStyle = `rgba(90,100,120,${0.28 * a})`; ctx.fillRect(x + 0.8, y + 1, g.s, g.s * 0.8);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, g.s, g.s * 0.8);
    }
    ctx.restore();
    // 4) 几颗大一点的结晶：压得很扁、贴在盘底，会反光
    SALT_BIG.forEach(([ux, uy, k, wid], i) => {
      const a = clamp(s * 1.8 - 0.3 - i * 0.07, 0, 1); if (a <= 0) return;
      const img = A['salt' + k], sc = wid / img.width, x = DISH.cx + ux * (SALT_RX - 20), y = SALT_CY + uy * (SALT_RY - 8);
      softShadow(ctx, x + 3, y + 3, wid * 0.42, 3.5, 0.28 * a);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(1, 0.62);
      ctx.drawImage(img, -img.width * sc / 2, -img.height * sc * 0.72, img.width * sc, img.height * sc); ctx.restore();
      const gl = Math.pow(Math.max(0, Math.sin(t / 650 + i * 2.1)), 10) * a;       // 反光：十字闪光
      if (gl > 0.05) { ctx.save(); ctx.translate(x - wid * 0.12, y - 7); ctx.fillStyle = `rgba(255,255,255,${0.95 * gl})`; ctx.fillRect(-0.9, -7 * gl - 1, 1.8, 14 * gl + 2); ctx.fillRect(-7 * gl - 1, -0.9, 14 * gl + 2, 1.8); ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, TAU); ctx.fill(); ctx.restore(); }
    });
  }

  function drawBeaker(ctx, t) {
    const K = S.beaker;
    if (K.lv <= 0.005) return;
    const bottom = BEAK.inBottom, topY = BEAK.rimY + 38;
    const y = lerp(bottom - 6, topY, K.lv);
    ctx.save(); ctx.clip(BEAK.pathIn);
    const hw = (BEAK.inR - BEAK.inL) / 2, e = { rx: hw - 1, ry: hw * BEAK.ratio };
    const body = new Path2D(); body.ellipse(BEAK.cx, y, e.rx, e.ry, 0, 0, TAU); body.rect(BEAK.cx - 200, y, 400, 400);
    ctx.save(); ctx.clip(body);
    const g = ctx.createLinearGradient(0, y - e.ry, 0, bottom);
    g.addColorStop(0, 'rgba(160,214,246,0.3)'); g.addColorStop(1, 'rgba(60,134,200,0.55)');
    ctx.fillStyle = g; ctx.fillRect(BEAK.cx - 200, y - e.ry, 400, 400);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(BEAK.cx, y, e.rx, e.ry, 0, 0, TAU);
    ctx.fillStyle = 'rgba(225,244,255,0.42)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(BEAK.cx, y, e.rx, e.ry, 0, 0.04, Math.PI - 0.04);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(BEAK.cx - e.rx * 0.3, y - e.ry * 0.2, e.rx * 0.4, e.ry * 0.35, 0, Math.PI * 1.1, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke();
    if (K.salty) {          // 滤过的水里还有看不见的盐：偶尔闪一下
      for (let i = 0; i < 7; i++) {
        const ph = (t / 1400 + i * 0.37) % 1, a = Math.sin(ph * Math.PI);
        const px = BEAK.cx + Math.sin(i * 12.9 + 1) * (hw - 24), py = lerp(y + 14, bottom - 18, (Math.sin(i * 7.3) + 1) / 2);
        ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        ctx.fillRect(px - 0.5, py - 4, 1, 8); ctx.fillRect(px - 4, py - 0.5, 8, 1);
      }
    }
    ctx.restore();
  }

  /* 玻璃：高光暗边盖回内容物上方；碗口和玻璃壁那一圈从 bg 重贴回最上层 */
  function softLine(ctx, pts, w, a, y0, y1) {
    // 沿折线画一道两头渐隐的柔和白色高光（多画几层由宽到窄，边缘就柔）
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, `rgba(255,255,255,${a})`); g.addColorStop(0.75, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [k, m] of [[1, 0.3], [0.62, 0.5], [0.3, 0.9]]) {
      ctx.globalAlpha = m; ctx.lineWidth = w * k; ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* 玻璃反光：程序画几道柔和的白色弧形高光（盖在内容物上，让内容物在玻璃后面） */
  function glassOver(ctx, clipPath, topY, kind) {
    ctx.save(); ctx.clip(clipPath);
    const r = new Path2D(); r.rect(0, topY, W, H); ctx.clip(r);
    if (kind === 'bowl') {
      const arc = (y0, y1, inset, side) => { const pts = []; for (let y = y0; y <= y1; y += 8) pts.push([BOWL.cx + side * (BOWL.hwAt(y) - inset), y]); return pts; };
      softLine(ctx, arc(400, 655, 19, -1), 11, 0.6, 400, 655);
      softLine(ctx, arc(420, 640, 36, -1), 5, 0.32, 420, 640);
      softLine(ctx, arc(430, 600, 17, 1), 8, 0.36, 430, 600);
      const fl = []; for (let t = 0.22; t <= 0.78; t += 0.04) fl.push([BOWL.cx + Math.cos(Math.PI * t) * 160 * -1, BOWL.floorY - 4 + Math.sin(Math.PI * t) * 24]);
      softLine(ctx, fl, 4, 0.3, BOWL.floorY - 6, BOWL.floorY + 24);
    } else {
      const vl = (x, y0, y1) => [[x, y0], [x, y1]];
      softLine(ctx, vl(BEAK.inL + 15, 400, 660), 10, 0.55, 400, 660);
      softLine(ctx, vl(BEAK.inL + 34, 430, 620), 4, 0.3, 430, 620);
      softLine(ctx, vl(BEAK.inR - 13, 420, 640), 6, 0.34, 420, 640);
    }
    ctx.restore();
  }
  function ringPaste(ctx, a, b) {
    ctx.save(); const p = new Path2D(); p.addPath(a); p.addPath(b); ctx.clip(p, 'evenodd');
    ctx.drawImage(A.bg, 0, 0, W, H); ctx.restore();
  }
  function bowlContentTop() {
    let y = 1e9; const B = S.bowl;
    if (B.base && B.base.amount > 0.02) y = Math.min(y, baseTopNow(B.base) - 26);
    if (B.water && B.water.amount > 0.01) y = Math.min(y, B.water.y - 26);
    for (const it of S.items) if (it.state !== 'rest' || !it.hidden) y = Math.min(y, it.y - it.h / 2);
    return Math.max(BOWL.rimY, y);
  }

  function drawGlow(ctx, t) {
    const g = S.glow; if (!g) return;
    const age = (t - g.t0) / 1000; if (age > 4) { S.glow = null; return; }
    const a = clamp(age * 3, 0, 1) * (age > 3 ? 4 - age : 1) * (0.7 + 0.3 * Math.sin(age * 7));
    for (const key of [].concat(g.key)) {
      ctx.save(); ctx.shadowColor = `rgba(255,224,90,${a})`; ctx.shadowBlur = 40; ctx.lineWidth = 7; ctx.strokeStyle = `rgba(255,243,160,${0.9 * a})`;
      if (key === 'dish') { ctx.stroke(DISH.outer); ctx.lineWidth = 3; ctx.stroke(ellPath(DISH.cx, DISH.outCy + 8, DISH.outRx - 8, DISH.outRy + 10)); }
      else if (key === 'bowl') { ctx.stroke(BOWL.pathOut); ctx.stroke(BOWL.ringOuter); }
      else if (key === 'funnel') { if (LAB.funnelGlow) LAB.funnelGlow(ctx); }
      else if (key === 'cupA' || key === 'cupB') { if (LAB.cupGlow) LAB.cupGlow(ctx, key.slice(3)); }
      else { ctx.stroke(BEAK.pathOut); ctx.stroke(BEAK.ringOuter); }
      ctx.restore();
    }
  }
  LAB.glow = (key, t) => { S.glow = { key, t0: t }; };

  /* ───────── 粒子 ───────── */
  LAB.fx = {
    dot(x, y, vx, vy, o) { S.fx.push(Object.assign({ type: 'dot', x, y, vx, vy, r: 2, c: '#c9a46c', life: 1, decay: 1, g: 600 }, o)); },
    steam(x, y) { S.fx.push({ type: 'steam', x, y, vx: rand(-8, 8), vy: rand(-46, -26), r: rand(10, 18), life: 1, decay: rand(0.38, 0.55), g: 0 }); },
    puff(x, y, n, up, cols, floor) {
      cols = cols || GRAIN.sand;
      for (let i = 0; i < n; i++) S.fx.push({ type: 'dot', x: x + rand(-14, 14), y: y + rand(-6, 6), vx: rand(-60, 60), vy: -(up == null ? 1 : up) * rand(40, 150), r: rand(1.4, 2.8), c: cols[i % cols.length], life: 1, decay: 1.2, g: 520, floor });
    },
    /* 沿贝塞尔弧线飞的粒子 */
    path(p0, p1, p2, dur, o) { S.fx.push(Object.assign({ type: 'path', p0, p1, p2, t: 0, dur, r: 2.2, c: '#c9a46c', life: 1 }, o)); },
    drop(x, y, o) { S.fx.push(Object.assign({ type: 'drop', x, y, vx: 0, vy: 0, r: 3.2, life: 1, decay: 0, g: 900, c: 'rgba(120,185,235,0.95)' }, o)); },
  };
  const bez = (p0, p1, p2, t) => { const u = 1 - t; return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y }; };
  LAB.bez = bez;

  function updateFx(dt) {
    const f = S.fx;
    for (const p of f) {
      if (p.type === 'path') {
        p.t += dt / p.dur; const q = bez(p.p0, p.p1, p.p2, Math.min(1, p.t)); p.x = q.x; p.y = q.y;
        if (p.t >= 1) { p.life = 0; if (p.onEnd) p.onEnd(p); }
        continue;
      }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor != null && p.y > p.floor) { p.y = p.floor; p.vx *= 0.4; p.vy = 0; p.g = 0; p.life -= dt * 3; }
      if (p.type === 'drop' && p.floorY != null && p.y >= p.floorY) { p.life = 0; if (p.onEnd) p.onEnd(p); }
      if (p.type === 'steam') { p.r += dt * 16; p.x += Math.sin(p.y / 18 + p.r) * 0.25; }
      p.life -= p.decay * dt;
    }
    S.fx = f.filter((p) => p.life > 0);
    if (S.fx.length > 900) S.fx.splice(0, S.fx.length - 900);
    // 泥水里的沙粒慢慢飘
    const w = S.bowl.water;
    if (w && S.bowl.specks.length) for (const s of S.bowl.specks) {
      s.x += s.vx * dt; s.y += s.vy * dt + Math.sin((s.x + s.y) / 40) * 0.08;
      if (s.x < BOWL.cx - 290 || s.x > BOWL.cx + 290) s.vx *= -1;
      if (s.y < w.y + 6 || s.y > 650) s.vy *= -1;
    }
  }
  function drawFx(ctx) {
    for (const p of S.fx) {
      if (p.type === 'steam') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        const a = 0.34 * Math.min(1, p.life * 1.6) * Math.min(1, (1 - p.life) * 5 + 0.15);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      } else if (p.type === 'drop') {
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.78, p.r * 1.25, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(p.x - p.r * 0.35, p.y - p.r * 0.7, 1.6, 2.4);
      } else {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  /* 弧线水流（倒水用）：t0..t1 是弧线上的起止比例，w 为线宽 */
  LAB.drawStream = function (ctx, p0, p1, p2, t0, t1, w, rgba, hi) {
    if (t1 - t0 < 0.01) return;
    const n = 26;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const q = bez(p0, p1, p2, lerp(t0, t1, i / n));
        const off = pass ? -w * 0.22 : 0;
        if (i === 0) ctx.moveTo(q.x + off, q.y); else ctx.lineTo(q.x + off, q.y);
      }
      ctx.strokeStyle = pass ? (hi || 'rgba(255,255,255,0.55)') : rgba; ctx.lineWidth = pass ? w * 0.28 : w;
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ───────── 总绘制 ───────── */
  LAB.scene = {
    update(dt) { updateFx(dt); },
    draw(ctx, t) {
      const cups = !!S.cups;
      ctx.drawImage(cups ? A.bgCups : A.bg, 0, 0, W, H);
      drawDish(ctx, t);
      if (!cups) drawBowl(ctx, t);
      drawBeaker(ctx, t);
      // 玻璃：高光暗边在内容物上，再把碗口与壁那一圈从 bg 重贴
      if (!cups) {
        glassOver(ctx, BOWL.pathIn, bowlContentTop(), 'bowl');
        ringPaste(ctx, BOWL.pathOut, BOWL.pathIn);
        ringPaste(ctx, BOWL.ringOuter, BOWL.ringInner);
      } else if (LAB.cupsDraw) LAB.cupsDraw(ctx, t);
      if (S.beaker.lv > 0.005) glassOver(ctx, BEAK.pathIn, BEAK.rimY + 30, 'beak');
      ringPaste(ctx, BEAK.pathOut, BEAK.pathIn);
      ringPaste(ctx, BEAK.ringOuter, BEAK.ringInner);
      if (S.fixtures) for (const f of S.fixtures) f(ctx, t);
      // 日光（蒸发）：整个画面暖一点
      if (S.sunLight > 0.01) { ctx.fillStyle = `rgba(255,214,120,${0.16 * S.sunLight})`; ctx.fillRect(0, 0, W, H); }
      drawGlow(ctx, t);
    },
    drawFx(ctx) { drawFx(ctx); },
    drawRest, bowlContentTop,
  };
  LAB.baseTopNow = baseTopNow;
})();
