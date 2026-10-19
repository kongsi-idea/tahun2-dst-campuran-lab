/* 溶解赛跑（DSKP 8.1.4）· 画面与流程。
   舞台固定 1600×900，整体等比缩放（fit，抄实验台 ui.js）。背景 assets/bg-dissolve.jpg 原图 1672×941，
   所有杯子的几何都用「原图像素」量出来写成常数，绘图时整个画布缩放 KX/KY 换算到舞台；DOM 元素的位置再乘 KX/KY。
   画法：水、糖、漩涡、冰块、茶匙先画在杯子内部并裁剪在杯形里，最后把「杯壁厚度、杯口一圈、杯底厚玻璃」从背景图重新贴回最上层，
   再叠几道玻璃高光，让东西看起来在玻璃里（做法同 scene.js 的大碗 ringPaste／glassOver）。 */
(function () {
  'use strict';
  const W = 1600, H = 900, IW = 1672, IH = 941, KX = W / IW, KY = H / IH;
  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ───────── 杯子几何（原图像素，对 bg-dissolve.jpg 量出） ─────────
     三个烧杯外壁左右约 197–545、673–1023、1152–1508，中心 371／848／1330。
     rimY：杯口椭圆中心（后缘 264、前缘 289）；hw：杯内半宽（外壁半宽 174 减去玻璃厚 9）；
     floorY／FLOOR_RY：杯内底（圆角）椭圆中心与半高，前缘落在 y≈692；OUT_*：外壁底部（厚玻璃）椭圆，前缘 y≈712；
     waterY：水面椭圆中心（三杯一样多）。 */
  const CX = [371, 848, 1330];
  const G = { rimY: 277, hw: 164, wall: 10, floorY: 660, floorRy: 32, outFloorY: 668, outFloorRy: 44, waterY: 345, surfRy: 10, rimOutRx: 176, rimOutRy: 14, rimInRx: 163, rimInRy: 8, sugarY: 676 };
  const T0 = 2.0;                // 糖落到杯底之后开始溶解的时刻（比赛时钟，秒）
  const MCURVE = 1.5;            // 剩余糖量 m = (1-u)^1.5

  /* ───────── 三场比赛 ─────────
     dur：从 T0 起到「溶完」的秒数，只用来演出（画面不写秒数）。最快约 4 秒，最慢约 12 秒。 */
  const RACES = [
    { id: 'stir', tab: '搅一搅', line: 'intro_stir', sum: 'sum_stir', fair: '只有「搅拌」不一样：', cups: [
      { name: '不搅拌', dur: 12, stir: 0, temp: 'room', sugar: 'coarse' },
      { name: '慢慢搅', dur: 7.2, stir: 2.4, temp: 'room', sugar: 'coarse' },
      { name: '快快搅', dur: 4, stir: 8.5, temp: 'room', sugar: 'coarse' }] },
    { id: 'temp', tab: '水的温度', line: 'intro_temp', sum: 'sum_temp', fair: '只有「水温」不一样：', cups: [
      { name: '冷水', dur: 12, stir: 0, temp: 'cold', sugar: 'coarse' },
      { name: '室温水', dur: 7.2, stir: 0, temp: 'room', sugar: 'coarse' },
      { name: '热水', dur: 4, stir: 0, temp: 'hot', sugar: 'coarse' }] },
    { id: 'size', tab: '糖的大小', line: 'intro_size', sum: 'sum_size', fair: '只有「糖的大小」不一样：', cups: [
      { name: '方糖', dur: 12, stir: 0, temp: 'room', sugar: 'cube' },
      { name: '粗砂糖', dur: 7.2, stir: 0, temp: 'room', sugar: 'coarse' },
      { name: '细砂糖', dur: 4, stir: 0, temp: 'room', sugar: 'fine' }] },
  ];
  const FAIR_TAIL = '三杯水一样多，糖一样多（一茶匙）';
  const TINT = { cold: [105, 182, 246], room: [140, 204, 232], hot: [244, 206, 152] };
  const L = window.RACE_LINES, Voice = window.RaceVoice;

  /* ───────── 图片 ───────── */
  const A = { sug: { coarse: [], fine: [], cube: [] } };
  const SUGAR_FILE = { coarse: 'sugar-coarse', fine: 'sugar-fine', cube: 'sugarcube' };
  function loadImg(src) {
    return new Promise((res) => {
      const im = new Image(); let tries = 0;
      im.onload = () => res(im);
      im.onerror = () => { if (tries++ < 3) setTimeout(() => { im.src = src + '?r=' + tries; }, 300); else res(im); };
      im.src = src;
    });
  }
  function bbox(im) {          // 透明边距之外的实际内容范围，用来对齐「落地点」
    const w = im.naturalWidth, h = im.naturalHeight; if (!w) return { img: im, w: 1, h: 1, cx: 0, by: 0 };
    const c = document.createElement('canvas'); c.width = w >> 2; c.height = h >> 2; const x = c.getContext('2d');
    x.drawImage(im, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y > y1) y1 = y; }
    return { img: im, w, h, cx: ((x0 + x1) / 2) * 4, by: (y1 + 1) * 4 };
  }
  async function loadAll() {       // 本机预览服务偶尔断线：分批载入，每张失败自动重试
    A.bg = await loadImg('assets/bg-dissolve.jpg');
    const jobs = [() => loadImg('assets/tools/spoon.png').then((i) => { A.spoon = i; }), () => loadImg('assets/tools/ice-1.png').then((i) => { A.ice = bbox(i); })];
    for (const k of Object.keys(SUGAR_FILE)) for (let n = 1; n <= 6; n++) jobs.push(() => loadImg(`assets/items/${SUGAR_FILE[k]}-${n}.png`).then((i) => { A.sug[k][n - 1] = bbox(i); }));
    for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((f) => f()));
  }
  // 茶匙：勺心（图内坐标）与柄尖；柄尖在勺心的右上方
  const SP = { bowlX: 85, bowlY: 308, w: 331, h: 377, s: 0.72 };

  /* ───────── 画布与舞台缩放 ───────── */
  const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
  let scale = 1, q = 1, paused = false;
  const glass = document.createElement('canvas'); let glassQ = 0;
  function fit() {
    const w = innerWidth, h = innerHeight;
    scale = Math.min(w / W, h / H);
    stage.style.transform = `translate(${(w - W * scale) / 2}px,${(h - H * scale) / 2}px) scale(${scale})`;
    const nq = clamp(scale * (window.devicePixelRatio || 1) * 1.5, 0.9, 2.2);
    if (Math.abs(nq - q) > 0.01 || cv.width !== Math.round(W * nq)) { q = nq; cv.width = Math.round(W * q); cv.height = Math.round(H * q); }
    stage.classList.toggle('small', scale < 0.6);       // 手机：按钮、字放大（见 race.css 末尾）
    checkRotate();
  }
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 60));
  const mqPortrait = matchMedia('(orientation: portrait)'), rotEl = $('#rotate');
  function checkRotate() {          // 手机转横提示：matchMedia + 短边判断，不用 screen.orientation.lock
    const show = (mqPortrait.matches || innerHeight > innerWidth) && Math.min(innerWidth, innerHeight) < 900;
    rotEl.classList.toggle('show', show); paused = show;
  }
  if (mqPortrait.addEventListener) mqPortrait.addEventListener('change', checkRotate); else mqPortrait.addListener(checkRotate);

  /* ───────── 路径 ───────── */
  function cupPaths(cx) {
    const inner = (top) => { const p = new Path2D(); p.moveTo(cx - G.hw, top); p.lineTo(cx - G.hw, G.floorY); p.ellipse(cx, G.floorY, G.hw, G.floorRy, 0, Math.PI, 0, true); p.lineTo(cx + G.hw, top); p.closePath(); return p; };
    const o = G.hw + G.wall, outer = new Path2D();
    outer.moveTo(cx - o, G.rimY); outer.lineTo(cx - o, G.outFloorY); outer.ellipse(cx, G.outFloorY, o, G.outFloorRy, 0, Math.PI, 0, true); outer.lineTo(cx + o, G.rimY); outer.closePath();
    const ell = (cy, rx, ry) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); return p; };
    return { inner: inner(G.rimY), band: (() => { const p = new Path2D(); p.addPath(outer); p.addPath(inner(G.rimY)); return p; })(),
      ring: (() => { const p = new Path2D(); p.addPath(ell(G.rimY - 0.5, G.rimOutRx, G.rimOutRy)); p.addPath(ell(G.rimY, G.rimInRx, G.rimInRy)); return p; })() };
  }
  /* 玻璃反光：几道柔和的白色弧线（盖在内容物上，让内容物在玻璃后面） */
  function softLine(c, pts, w, a, y0, y1) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, 'rgba(255,255,255,1)'); g.addColorStop(0.8, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.strokeStyle = g; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [k, m] of [[1, 0.28], [0.6, 0.5], [0.3, 0.9]]) { c.globalAlpha = a * m; c.lineWidth = w * k; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
    c.globalAlpha = 1;
  }
  function buildGlass() {           // 杯壁、杯口、杯底从背景图贴回来 + 高光，一次画好，每帧只盖一张图
    glassQ = q; glass.width = Math.round(W * q); glass.height = Math.round(H * q);
    const c = glass.getContext('2d'); c.setTransform(q * KX, 0, 0, q * KY, 0, 0); c.clearRect(0, 0, IW, IH);
    for (const cup of cups) {
      c.save(); c.clip(cup.paths.band, 'evenodd'); c.globalAlpha = 0.92; c.drawImage(A.bg, 0, 0, IW, IH); c.restore();
      c.save(); c.clip(cup.paths.ring, 'evenodd'); c.drawImage(A.bg, 0, 0, IW, IH); c.restore();
      c.save(); c.clip(cup.paths.inner);
      const x = cup.cx, hw = G.hw;
      softLine(c, [[x - hw + 17, 330], [x - hw + 17, 640]], 10, 0.55, 330, 640);
      softLine(c, [[x - hw + 38, 360], [x - hw + 38, 610]], 4, 0.3, 360, 610);
      softLine(c, [[x + hw - 15, 350], [x + hw - 15, 630]], 7, 0.34, 350, 630);
      const fl = []; for (let t = 0.2; t <= 0.8; t += 0.05) fl.push([x - Math.cos(Math.PI * t) * (hw - 12), G.floorY + Math.sin(Math.PI * t) * (G.floorRy - 6)]);
      softLine(c, fl, 4, 0.4, G.floorY - 4, G.floorY + 30);
      c.restore();
    }
  }

  /* ───────── 状态 ───────── */
  const R = { race: 0, state: 'guess', guess: -1, T: -1, scale: 1, done: [false, false, false], order: [], log: [], results: [], finalShown: false, cardShown: false };
  let cups = [], now = 0, raceN = 0;

  function makeCups(race) {
    raceN++;
    cups = race.cups.map((def, i) => {
      const rnd = mulberry32(7000 + raceN * 31 + i * 101);
      const kind = def.sugar, N = kind === 'fine' ? 150 : kind === 'coarse' ? 72 : 0;
      const parts = [];
      for (let n = 0; n < N; n++) {
        const ty = G.waterY + 36 + Math.pow(rnd(), 0.75) * (G.floorY + 10 - G.waterY - 36);
        parts.push({ k: rnd(), t0: 0.6 + rnd() * 0.55, x0: CX[i] - 26 + (rnd() - 0.5) * 30, ly: 246 + rnd() * 6, ty, vs: 90 + rnd() * 210, ph: rnd() * TAU, amp: 3 + rnd() * 12,
          r: kind === 'fine' ? 1.2 + rnd() * 0.9 : 2.2 + rnd() * 1.8, th0: rnd() * TAU, R: 24 + rnd() * 125 });
      }
      const plume = []; if (kind === 'cube') for (let n = 0; n < 16; n++) plume.push({ ph: rnd(), dx: (rnd() - 0.5) * 70, up: 90 + rnd() * 90, r: 1.6 + rnd() * 1.6, sw: rnd() * TAU });
      return { i, cx: CX[i], def, kind, paths: cupPaths(CX[i]), parts, plume, T0, sprite: A.sug[kind][(i * 2 + raceN) % 6], pOff: (rnd() - 0.5) * 36, doneT: 0, rank: 0 };
    });
    buildGlass();
  }
  const massOf = (c, T) => (T < c.T0 ? 1 : Math.pow(1 - clamp((T - c.T0) / c.def.dur, 0, 1), MCURVE));

  /* ───────── 绘图：杯内内容物 ───────── */
  const rgba = (t, a) => `rgba(${t[0]},${t[1]},${t[2]},${a})`;
  function spriteAt(ctx, s, x, yBottom, sc, a, rot) {
    if (!s || !s.w) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, yBottom); if (rot) ctx.rotate(rot);
    ctx.drawImage(s.img, -s.cx * sc, -s.by * sc, s.w * sc, s.h * sc); ctx.restore();
  }
  function grainPos(c, p, T) {      // 一粒糖在水里的位置（由比赛时钟直接算出）
    const tau = T - p.t0; if (tau < 0) return null;
    const hit = Math.sqrt(2 * Math.max(1, G.waterY - p.ly) / 1500);
    if (tau < hit) return { x: p.x0, y: p.ly + 0.5 * 1500 * tau * tau };
    const ts = tau - hit;
    let x = p.x0 + Math.sin(p.ph + ts * 1.3) * p.amp * Math.min(1, ts * 1.5);
    let y = G.waterY + Math.min(p.vs * ts, p.ty - G.waterY);
    const w = c.def.stir;
    if (w > 0) {      // 搅拌：慢慢汇进水里的旋涡，绕着杯心转（椭圆表示透视）
      const b = clamp((T - 1.5) / 1.0, 0, 1) * clamp(ts / 0.6, 0, 1) * (c.doneT ? 1 - clamp((T - c.doneT) / 0.6, 0, 1) : 1);
      const R0 = clamp(Math.abs(x - c.cx) + p.R * 0.4, 26, 150), th = p.th0 + w * (T - 1.5);
      x = lerp(x, c.cx + R0 * Math.cos(th), b); y = lerp(y, y + R0 * 0.16 * Math.sin(th), b);
    }
    return { x, y };
  }
  function cubePos(c, T) {          // 方糖：从匙里掉下来，落水后慢慢沉到杯底
    const t0 = 0.72, tau = T - t0; if (tau < 0) return null;
    const x0 = c.cx - 22, y0 = 246, hit = Math.sqrt(2 * (G.waterY - y0) / 1500);
    const bottom = G.sugarY + 4;
    if (tau < hit) return { x: x0, y: y0 + 0.5 * 1500 * tau * tau, rot: tau * 3 };
    const y = Math.min(G.waterY + 330 * (tau - hit), bottom);
    return { x: lerp(x0, c.cx + c.pOff, ease((y - G.waterY) / (bottom - G.waterY))), y, rot: (1 - ease((y - G.waterY) / (bottom - G.waterY))) * 0.5 + 0.02 };
  }

  function drawContents(c, T, now) {
    const cx = c.cx, d = c.def, t = TINT[d.temp], hw = G.hw, wy = G.waterY, fy = G.floorY + G.floorRy;
    const m = massOf(c, T), running = T >= 0;
    ctx.save(); ctx.clip(c.paths.inner);
    // 1 水体：越深越浓
    const g = ctx.createLinearGradient(0, wy, 0, fy);
    g.addColorStop(0, rgba(t, 0.3)); g.addColorStop(1, rgba([t[0] * 0.8, t[1] * 0.84, t[2] * 0.9], 0.55));
    ctx.fillStyle = g; ctx.fillRect(cx - hw - 2, wy, hw * 2 + 4, fy - wy + 4);
    ctx.fillStyle = rgba(t, 0.34); ctx.beginPath(); ctx.ellipse(cx, wy, hw, G.surfRy, 0, 0, TAU); ctx.fill();
    // 2 热水：小气泡从杯底往上冒
    if (d.temp === 'hot') {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 7; k++) { const u = ((now * 0.22 + k / 7) % 1), bx = cx - 120 + k * 40 + Math.sin(now * 2 + k * 2) * 6, by = fy - 20 - u * (fy - wy - 24); ctx.globalAlpha = Math.sin(u * Math.PI) * 0.8; ctx.beginPath(); ctx.arc(bx, by, 2.5 + (k % 3), 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // 3 浑浊：糖粒悬在水里，水看起来发白；糖越少越清澈
    if (running) {
      const grow = clamp((T - 0.8) / 0.9, 0, 1), hz = (d.sugar === 'cube' ? 0.16 : 0.4) * grow * Math.pow(m, 0.7);
      if (hz > 0.002) { ctx.fillStyle = `rgba(255,255,255,${hz})`; ctx.fillRect(cx - hw - 2, wy, hw * 2 + 4, fy - wy + 4); }
      if (d.sugar === 'cube' && T > 1.9) {       // 方糖：糖水像一缕白烟从方糖往上飘
        const pg = ctx.createRadialGradient(cx + c.pOff, G.sugarY - 50, 6, cx + c.pOff, G.sugarY - 70, 130);
        pg.addColorStop(0, `rgba(255,255,255,${0.42 * Math.pow(m, 0.6)})`); pg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = pg; ctx.fillRect(cx - hw, wy, hw * 2, fy - wy);
      }
    }
    // 4 漩涡：搅拌的杯子，水里有几圈转动的环
    let stirK = 0;
    if (d.stir > 0 && running) stirK = clamp((T - 1.8) / 0.8, 0, 1) * (c.doneT ? 1 - clamp((T - c.doneT) / 0.8, 0, 1) : 1);
    if (stirK > 0.01) {
      ctx.save(); ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.setLineDash([30, 26]);
      for (let j = 0; j < 4; j++) {
        const rx = 132 - j * 24, y = wy + 38 + j * 88; ctx.lineDashOffset = -(T - 1.5) * d.stir * (rx * 0.5) * (j % 2 ? 0.8 : 1);
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * stirK})`; ctx.beginPath(); ctx.ellipse(cx, y, rx, rx * 0.16, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      const dg = ctx.createRadialGradient(cx, wy + 3, 2, cx, wy + 3, 95); dg.addColorStop(0, rgba([40, 90, 130], 0.34 * stirK)); dg.addColorStop(1, rgba([40, 90, 130], 0));
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(cx, wy + 3, 100, 13, 0, 0, TAU); ctx.fill();
    }
    // 5 杯底的糖堆：越来越小、越来越少
    if (running && m > 0.003) {
      if (d.sugar === 'cube') {
        const p = cubePos(c, T);
        if (p) { const sc = 0.25 * Math.pow(Math.max(m, 0.0001), 1 / 3), a = clamp(m * 24, 0, 1); spriteAt(ctx, c.sprite, p.x, p.y + 0, sc, a, p.rot); }
      } else {
        const grow = ease((T - 1.05) / 0.9), sc = (d.sugar === 'fine' ? 0.5 : 0.47) * grow * (0.14 + 0.86 * Math.pow(m, 0.5)), a = clamp(m * 22, 0, 1);
        if (grow > 0.01) spriteAt(ctx, c.sprite, cx + c.pOff, G.sugarY + 6, sc, a, 0);
      }
    }
    // 6 悬在水里的糖粒（先溶完的先消失）、方糖的白烟粒
    if (running) {
      ctx.lineWidth = 0.9;
      if (d.sugar !== 'cube') {
        const lim = Math.pow(m, 0.85);
        for (const p of c.parts) {
          const a = clamp((lim - p.k) * 14, 0, 1); if (a <= 0.01) continue;
          const pp = grainPos(c, p, T); if (!pp) continue;
          ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(pp.x, pp.y, p.r, 0, TAU); ctx.fill();
          if (p.r > 2.4) { ctx.strokeStyle = 'rgba(160,190,210,.8)'; ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
      } else if (T > T0 - 0.2) {
        for (const p of c.plume) {
          const age = (((T - T0 + p.ph * 3.2) % 3.2) + 3.2) % 3.2 / 3.2, a = Math.sin(Math.PI * age) * clamp(m * 3, 0, 1) * 0.9; if (a < 0.02) continue;
          ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.beginPath(); ctx.arc(cx + c.pOff + p.dx * (0.4 + age) + Math.sin(age * 5 + p.sw) * 8, G.sugarY - 40 - age * p.up, p.r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    // 7 冷水：冰块浮在水面，一半泡在水里，轻轻上下晃
    if (d.temp === 'cold' && A.ice) {
      const melt = 1 - 0.1 * clamp((T - 1) / 12, 0, 1);
      [[-60, 0.3, 0], [62, 0.22, 1.7]].forEach(([dx, sc, ph]) => {
        const bob = Math.sin(now * 1.5 + ph) * 2.2; ctx.save(); ctx.translate(cx + dx, wy + 14 + bob); ctx.rotate(Math.sin(now * 1.1 + ph) * 0.05);
        const s = sc * melt; ctx.drawImage(A.ice.img, -A.ice.w * s / 2, -A.ice.h * s * 0.62, A.ice.w * s, A.ice.h * s); ctx.restore();
      });
    }
    // 8 茶匙在水里的部分（水面以下，被杯形裁剪）
    const sp = spoonPose(c, T, now); if (sp.alpha > 0.01) drawSpoon(sp);
    // 9 水面之前的一层淡淡的水色（让水里的东西像隔着水），再加水面高光
    const fg = ctx.createLinearGradient(0, wy, 0, fy); fg.addColorStop(0, rgba(t, 0.2)); fg.addColorStop(1, rgba(t, 0.28));
    ctx.fillStyle = fg; ctx.fillRect(cx - hw - 2, wy + 1, hw * 2 + 4, fy - wy + 4);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(cx, wy, hw - 1, G.surfRy, 0, 0.04, Math.PI - 0.04); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,140,175,.45)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(cx, wy, hw - 1, G.surfRy, 0, Math.PI + 0.04, TAU - 0.04); ctx.stroke();
    if (running && T < 2.2) {          // 糖落水的涟漪
      for (let k = 0; k < 6; k++) { const age = T - (0.62 + k * 0.09); if (age < 0 || age > 1) continue; const rx = 8 + age * 52; ctx.strokeStyle = `rgba(255,255,255,${(1 - age) * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx - 24 + k * 3, wy, rx, rx * 0.14, 0, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  /* ───────── 茶匙 ───────── */
  function spoonPose(c, T, now) {
    const cx = c.cx, d = c.def, bob = Math.sin(now * 1.8 + c.i) * 3;
    const rest = { x: cx - 112, y: 232, a: 0.78 }, pour = { x: cx + 8, y: 238, a: 0.78 }, dump = { x: cx + 8, y: 238, a: 0.2 };
    if (T < 0) return { x: rest.x, y: rest.y + bob, a: rest.a + Math.sin(now * 1.8 + c.i) * 0.02, alpha: 1, sg: 1 };
    const pose = (p, sg) => ({ x: p.x, y: p.y, a: p.a, alpha: 1, sg });
    const sgOn = d.sugar === 'cube' ? (T < 0.72 ? 1 : 0) : 1 - clamp((T - 0.5) / 0.5, 0, 1);
    if (T < 0.45) { const e = ease(T / 0.45); return pose({ x: lerp(rest.x, pour.x, e), y: lerp(rest.y, pour.y, e), a: pour.a }, 1); }
    if (T < 1.05) return pose({ x: pour.x, y: pour.y, a: lerp(pour.a, dump.a, ease((T - 0.45) / 0.5)) }, sgOn);
    if (T < 1.35) return pose(dump, 0);
    if (d.stir > 0) {
      const Ro = 38, sx = (th) => cx + Ro * Math.cos(th), sy = (th) => 470 + Ro * 0.16 * Math.sin(th);
      const th = d.stir * Math.max(0, T - 2.0), bx = sx(th), by = sy(th), a0 = -0.42 - 0.0045 * (bx - cx);
      if (T < 2.0) { const e = ease((T - 1.35) / 0.65); return { x: lerp(dump.x, sx(0), e), y: lerp(dump.y, sy(0), e), a: lerp(dump.a, -0.42 - 0.0045 * Ro, e), alpha: 1, sg: 0 }; }
      if (c.doneT && T > c.doneT) { const e = ease((T - c.doneT) / 0.8); return { x: lerp(bx, cx + 40, e), y: lerp(by, 150, e), a: lerp(a0, 0.3, e), alpha: 1 - e, sg: 0 }; }
      return { x: bx, y: by, a: a0, alpha: 1, sg: 0 };
    }
    const e = ease((T - 1.35) / 0.75); return { x: lerp(dump.x, cx + 130, e), y: lerp(dump.y, 150, e), a: lerp(dump.a, 0.9, e), alpha: 1 - e, sg: 0, c };
  }
  let spoonCtxSugar = null;
  function drawSpoon(sp, sugarCup) {
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.a); ctx.globalAlpha = sp.alpha;
    ctx.shadowColor = 'rgba(40,25,5,.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
    ctx.drawImage(A.spoon, -SP.bowlX * SP.s, -SP.bowlY * SP.s, SP.w * SP.s, SP.h * SP.s);
    ctx.shadowColor = 'transparent';
    const c = sugarCup || spoonCtxSugar;
    if (c && sp.sg > 0.01) {
      const k = c.kind, sc = (k === 'cube' ? 0.13 : k === 'fine' ? 0.18 : 0.17) * sp.sg;
      spriteAt(ctx, c.sprite, 0, 8, sc, Math.min(1, sp.sg * 2), 0);
    }
    ctx.restore();
  }

  /* ───────── 一帧 ───────── */
  function frame() {
    const T = R.T;
    ctx.setTransform(q * KX, 0, 0, q * KY, 0, 0);
    ctx.clearRect(0, 0, IW, IH); ctx.drawImage(A.bg, 0, 0, IW, IH);
    for (const c of cups) { spoonCtxSugar = c; drawContents(c, T, now); }
    if (glassQ !== q) buildGlass();
    ctx.drawImage(glass, 0, 0, IW, IH);
    // 茶匙在杯口以上的部分（盖在后缘之前；前缘之后的部分在杯内已画，被杯口重新盖住）
    for (const c of cups) {
      const sp = spoonPose(c, T, now); if (sp.alpha <= 0.01) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, IW, G.rimY); ctx.clip(); spoonCtxSugar = c; drawSpoon(sp, c); ctx.restore();
    }
    for (const c of cups) if (c.def.temp === 'hot') drawSteam(c);
  }
  function drawSteam(c) {         // 热水冒出的热气：从水面升起、飘出杯口；暖色阴影边，浅色背景上也看得出；杯口上方有波动的热浪
    const rise = G.waterY - G.rimY + 170;
    for (let k = 0; k < 16; k++) {
      const u = (now * 0.22 + k / 16) % 1, x = c.cx + Math.sin(now * 1.2 + k * 2.1) * 40 * (0.3 + u) + ((k % 4) - 1.5) * 38, y = G.waterY - 6 - u * rise, r = 24 + u * 56, a = Math.min(1, u * 5) * (1 - u * 0.8);
      const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(255,255,255,${Math.min(1, a * 1.15)})`); g.addColorStop(0.5, `rgba(255,250,244,${a * 0.9})`); g.addColorStop(0.8, `rgba(214,128,70,${a * 0.5})`); g.addColorStop(1, 'rgba(214,128,70,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.lineCap = 'round';      // 热浪：杯口上方几条左右摆动的细波纹（像空气被烤得扭动）
    for (let k = 0; k < 5; k++) {
      const x0 = c.cx - 110 + k * 55, ph = now * 3 + k * 1.7; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.beginPath();
      for (let yy = 0; yy <= 120; yy += 8) { const xx = x0 + Math.sin(ph + yy * 0.09) * (6 + yy * 0.07); const Y = G.rimY - 10 - yy; if (yy) ctx.lineTo(xx, Y); else ctx.moveTo(xx, Y); }
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(ph); ctx.stroke();
      ctx.strokeStyle = 'rgba(214,128,70,.28)'; ctx.lineWidth = 8; ctx.globalAlpha *= 0.6; ctx.stroke();
    }
    ctx.restore();
  }

  /* ───────── DOM：切换、杯名牌、点击区 ───────── */
  const tabsEl = $('#tabs'), labelsEl = $('#labels'), hitsEl = $('#hits'), promptEl = $('#prompt'), fairEl = $('#fair'), actEl = $('#act'), cardEl = $('#card'), finalEl = $('#final'), flagEl = $('#flag'), ribEl = $('#ribbons');
  const SUG_THUMB = { cube: 'sugarcube-1', coarse: 'sugar-coarse-1', fine: 'sugar-fine-1' };
  RACES.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.dataset.race = i; b.setAttribute('role', 'tab');
    b.innerHTML = `<span class="no">${i + 1}</span><span>${r.tab}</span>`; b.addEventListener('click', () => selectRace(i)); tabsEl.appendChild(b);
  });
  const hitBtns = [], labBtns = [];
  CX.forEach((cx, i) => {
    const xs = cx * KX;
    const h = document.createElement('button'); h.type = 'button'; h.className = 'hit'; h.style.left = (xs - 190) + 'px'; h.setAttribute('aria-label', '选这一杯'); h.addEventListener('click', () => pick(i)); hitsEl.appendChild(h); hitBtns.push(h);
    const l = document.createElement('button'); l.type = 'button'; l.className = 'lab'; l.style.left = xs + 'px'; l.addEventListener('click', () => pick(i)); labelsEl.appendChild(l); labBtns.push(l);
  });
  const say = (...keys) => Voice.say(keys.map((k) => L[k]));

  function selectRace(i) {
    R.race = i; R.state = 'guess'; R.guess = -1; R.T = -1; R.order = []; R.cardShown = false;
    const race = RACES[i]; makeCups(race);
    document.querySelectorAll('.tab').forEach((t, k) => { t.classList.toggle('on', k === i); t.classList.toggle('done', R.done[k]); t.setAttribute('aria-selected', k === i); });
    race.cups.forEach((d, k) => {
      labBtns[k].classList.remove('pick', 'win');
      labBtns[k].innerHTML = (race.id === 'size' ? `<img src="assets/items/${SUG_THUMB[d.sugar]}.png" alt="" draggable="false">` : '') + `<span class="nm">${d.name}</span>`;
    });
    ribEl.innerHTML = ''; flagEl.classList.remove('show');
    fairEl.innerHTML = `<span>${race.fair}</span><b>${FAIR_TAIL}</b>`;
    cardEl.classList.remove('show'); finalEl.classList.remove('show'); R.finalShown = false;
    document.body.classList.remove('lock'); stage.classList.remove('lock');
    setPrompt(L.ask.t); setAct(); say(race.line, 'ask');
  }
  function setPrompt(t) { promptEl.textContent = t; promptEl.classList.toggle('hide', !t); }
  function setAct() {
    const allDone = R.done.every(Boolean);
    actEl.classList.remove('go'); actEl.disabled = false;
    if (R.state === 'guess') { actEl.textContent = '先猜一猜'; actEl.disabled = true; }
    else if (R.state === 'ready') { actEl.textContent = '放糖'; actEl.classList.add('go'); }
    else if (R.state === 'run') { actEl.textContent = '比赛中…'; actEl.disabled = true; }
    else { actEl.textContent = allDone ? '看总结' : '下一场'; }
  }
  function pick(i) {
    if (R.state !== 'guess' && R.state !== 'ready') return;
    R.guess = i; R.state = 'ready';
    labBtns.forEach((b, k) => b.classList.toggle('pick', k === i));
    const lt = stage.classList.contains('small') ? 688 : 704;
    flagEl.style.left = (CX[i] * KX - 170 + 16) + 'px'; flagEl.style.top = (lt - 100) + 'px';
    flagEl.classList.remove('show'); void flagEl.offsetWidth; flagEl.classList.add('show');
    setPrompt(L.ready.t); setAct(); say('ready');
  }
  actEl.addEventListener('click', () => {
    if (R.state === 'ready') start();
    else if (R.state === 'done') { if (R.done.every(Boolean)) showFinal(); else selectRace(nextRace()); }
  });
  const nextRace = () => { for (let k = 1; k <= 3; k++) { const j = (R.race + k) % 3; if (!R.done[j]) return j; } return (R.race + 1) % 3; };
  function start() {
    R.state = 'run'; R.T = 0; R.order = []; stage.classList.add('lock'); setPrompt(L.go.t); setAct(); say('go');
  }
  function onCupDone(c, T) {
    c.doneT = T; R.order.push(c.i); c.rank = R.order.length; R.log.push({ race: RACES[R.race].id, cup: c.i, name: c.def.name, rank: c.rank, t: +T.toFixed(2) });
    const xs = CX[c.i] * KX, r = document.createElement('div'); r.className = 'rib r' + c.rank; r.style.left = ((CX[c.i] + 174) * KX - 78) + 'px'; r.style.top = '592px';   // 烧杯右下角（外壁右缘 174），底边在杯名牌上方
    r.innerHTML = `<i class="tail l"></i><i class="tail r"></i><i class="disc">第 ${c.rank}</i>`; ribEl.appendChild(r);
  }
  function finishRace() {
    R.state = 'done'; R.done[R.race] = true; const win = R.order[0], ok = R.guess === win, race = RACES[R.race];
    R.results.push({ race: race.id, order: R.order.slice(), guess: R.guess, ok });
    labBtns[win].classList.add('win');
    cardEl.classList.toggle('miss', !ok);
    cardEl.querySelector('.title').textContent = ok ? L.right.t : L.wrong.t; cardEl.querySelector('.sum').textContent = L[race.sum].t;
    cardEl.classList.add('show'); R.cardShown = true; setPrompt(''); setAct(); stage.classList.remove('lock');
    document.querySelectorAll('.tab')[R.race].classList.add('done');
    say(ok ? 'right' : 'wrong', race.sum, 'remind');
  }
  $('#again').addEventListener('click', () => selectRace(R.race));
  function showFinal() {
    finalEl.querySelector('.rule').textContent = L.final.t; cardEl.classList.remove('show'); finalEl.classList.add('show'); R.finalShown = true; say('final');
  }
  $('#restart').addEventListener('click', () => { R.done = [false, false, false]; R.results = []; R.log = []; selectRace(0); });
  $('#reminder').addEventListener('click', () => say('remind'));
  const muteEl = $('#mute');
  muteEl.addEventListener('click', () => { Voice.on = !Voice.on; muteEl.setAttribute('aria-pressed', String(!Voice.on)); if (!Voice.on) Voice.stop(); });

  /* ───────── 主循环 ───────── */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!paused) {
      now += dt;
      if (R.state === 'run' || R.state === 'done') R.T = Math.min(60, R.T + dt * R.scale);
      if (R.state === 'run') {
        for (const c of cups) if (!c.doneT && R.T >= c.T0 + c.def.dur) onCupDone(c, c.T0 + c.def.dur);
        if (cups.every((c) => c.doneT) && R.T >= Math.max(...cups.map((c) => c.doneT)) + 0.9) finishRace();
      }
      if (A.bg && A.bg.naturalWidth) frame();
    }
    requestAnimationFrame(loop);
  }

  loadAll().then(() => {
    fit(); selectRace(0); requestAnimationFrame(loop);
  });
  // 测试钩子
  window.__race = { R, G, RACES, lines: L, clipKey: window.raceClipKey, voice: Voice, pick, start, selectRace, cups: () => cups, now: () => now, showFinal };
})();
