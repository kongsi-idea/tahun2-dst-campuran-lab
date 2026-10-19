/* 分离大法实验室 · 倒进去再处理的三个工具：筛子、滤纸（含放大镜）、蒸发（太阳）。 */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { W, H, GEO, S, A, rand, clamp, lerp, smooth, pick, shuffle, bez } = LAB;
  const { BOWL, DISH, BEAK } = GEO;
  const T = LAB.T, TAU = Math.PI * 2, ease = LAB.ease, easeIO = smooth;
  const TOOL_H = 150;
  const toast = (m) => LAB.ui.toast(m), tip = (m) => LAB.ui.tip(m);
  const HEAP_SC = LAB.HEAP_SC;
  const liquidCol = (l) => (l === 'muddy' ? 'rgba(150,112,66,0.86)' : l === 'milky' ? 'rgba(244,241,232,0.92)' : 'rgba(110,180,235,0.8)');

  /* ───────── 倒东西：碗里的内容物一点点搬到目的地 ─────────
     cfg: side('l'|'r') dur dest{x,y} grains(底料种类|null) liquid('water'|'muddy'|null)
          itemTarget(it)→{x,y,sc,rot}  onItem(it,tgt)  */
  function makePour(cfg) {
    const B = S.bowl, side = cfg.side, fromBeaker = cfg.src === 'beaker', ext = !!cfg.src, lv0 = S.beaker.lv;       // src：'beaker'（连环关第 3 步从烧杯倒）、'cup'（两杯找盐从杯子倒），都不动大碗
    const p0 = cfg.p0 ? cfg.p0 : fromBeaker ? { x: BEAK.outL + 3, y: BEAK.rimY - 3 } : { x: side === 'l' ? BOWL.mouth.l - 2 : BOWL.mouth.r + 2, y: BOWL.mouth.y + 4 };
    const p1 = ext ? { x: (p0.x + cfg.dest.x) / 2, y: p0.y - 170 } : { x: p0.x + (side === 'l' ? -80 : 80), y: p0.y - 80 }, p2 = cfg.dest;
    const items = shuffle(S.items.filter((it) => it.state === 'rest'));
    items.forEach((it, i) => { it.pourStart = 0.15 + (i / Math.max(1, items.length)) * cfg.dur * 0.6; it.y0 = it.y; });
    const top0 = B.base ? B.base.top : 0;
    const P = { t: 0, f: 0, done: false, p0, p1, p2, cfg, items, acc: 0 };
    P.update = function (dt) {
      P.t += dt; const f = clamp(P.t / cfg.dur, 0, 1); P.f = f;
      if (fromBeaker) S.beaker.lv = lv0 * (1 - easeIO(f));
      if (cfg.onProgress) cfg.onProgress(f, P);
      if (B.base && !ext) { B.base.amount = Math.max(0, 1 - easeIO(f)); B.baseDirty = true; }
      if (B.water && !ext) { B.water.y = lerp(B.water.home, BOWL.floorY - 4, easeIO(f)); if (f >= 1) B.water.amount = 0; }
      const dTop = B.base && !ext ? LAB.baseTopNow(B.base) - top0 : 0;
      if (cfg.grains && f < 0.96) {
        P.acc += dt * 230; const n = Math.floor(P.acc); P.acc -= n;
        for (let i = 0; i < n; i++) {
          const j = () => rand(-9, 9);
          LAB.fx.path({ x: p0.x + j() * 0.5, y: p0.y + j() * 0.5 }, { x: p1.x + j(), y: p1.y + j() }, { x: p2.x + j() * 1.5, y: p2.y + j() * 0.4 }, rand(0.4, 0.55), { r: rand(1.2, 2.5), c: pick(LAB.GRAIN[cfg.grains]) });
        }
      }
      for (const it of items) {
        if (it.state === 'rest') {
          if (it.depth === 'surf' || it.depth === 'half' || it.depth === 'side' || it.hidden) it.y = it.y0 + dTop;
          if (P.t >= it.pourStart) {
            const tgt = cfg.itemTarget(it);
            it.state = 'pour'; it.pt = 0; it.hidden = false; it.alpha = 1; it.covA = 0; it.pfrom = { x: it.x, y: it.y }; it.ptgt = tgt;
            it.fsc = 1; it.fsq = it.squash; it.rot0 = it.rot;
            LAB.fx.puff(it.x, it.y, 5, 0.9, LAB.GRAIN.sand, it.y + 14);
          }
        } else if (it.state === 'pour') {
          it.pt += dt / 0.62; const e = easeIO(it.pt), tg = it.ptgt;
          const c = { x: (it.pfrom.x + tg.x) / 2, y: Math.min(it.pfrom.y, tg.y) - 170 };
          const q = bez(it.pfrom, c, tg, e); it.x = q.x; it.y = q.y;
          it.fsc = lerp(1, tg.sc, e); it.fsq = lerp(it.squash, 1, e); it.rot = lerp(it.rot0, tg.rot, e);
          if (it.pt >= 1) { it.state = 'gone'; cfg.onItem(it, tg); }
        }
      }
      if (f >= 1 && !P.done && items.every((it) => it.state === 'gone')) { P.done = true; if (cfg.onDone) cfg.onDone(); }
    };
    P.draw = function (ctx) {
      if (!cfg.liquid) return;
      const f = P.f, head = clamp(P.t / 0.3, 0, 1), tail = f > 0.9 ? (f - 0.9) / 0.1 : 0;
      const col = liquidCol(cfg.liquid);
      LAB.drawStream(ctx, p0, p1, p2, clamp(tail, 0, 1), head, cfg.liquid === 'muddy' ? 18 : 16, col, 'rgba(255,255,255,0.55)');
      if (head >= 1 && tail < 1 && Math.random() < 0.6) LAB.fx.dot(p2.x + rand(-14, 14), p2.y, rand(-50, 50), rand(-130, -50), { r: rand(1.4, 2.6), c: cfg.liquid === 'muddy' ? '#a98456' : cfg.liquid === 'milky' ? '#f4f1e8' : 'rgba(200,230,255,0.9)', g: 520, decay: 1.5 });
    };
    return P;
  }

  LAB.makePour = makePour;
  const P0done = (run) => run.pour && run.pour.f > 0.2;
  /* 湿沙：滤纸里一层深色、有颗粒、表面带水光的沙堆（3/4 俯视的椭圆） */
  function drawWetSand(ctx, x, y, rx0, amt, kind) {
    const flour = kind === 'flour';
    const rx = rx0 * (0.55 + 0.45 * Math.sqrt(amt)), ry = rx * 0.27, hgt = 10 + 10 * amt;
    ctx.save();
    const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.clip(p);
    ctx.fillStyle = flour ? '#d9d2c3' : '#6b4e2c'; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = flour ? 0.3 : 0.4; ctx.fillStyle = ctx.createPattern((flour ? LAB.PAT.flour : LAB.PAT.sand).canvas, 'repeat'); ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.5 - hgt * 0.3, 2, x, y, rx);
    g.addColorStop(0, flour ? 'rgba(255,255,248,0.4)' : 'rgba(255,230,170,0.35)'); g.addColorStop(0.5, 'rgba(60,35,12,0.0)'); g.addColorStop(1, flour ? 'rgba(90,80,65,0.4)' : 'rgba(25,12,2,0.55)');
    ctx.fillStyle = g; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.strokeStyle = flour ? 'rgba(110,98,80,0.55)' : 'rgba(40,24,8,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - rx * 0.28, y - ry * 0.3, rx * 0.3, ry * 0.3, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
  }
  function drawWetPaper(ctx, x, y, rx) {
    const ry = rx * 0.3;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = 'rgba(120,170,215,0.45)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.3, ry * 0.3, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();
  }
  function heapSlot(i, cx, cy, rx) {
    i = Math.max(0, i | 0);          // 根因：第一个落下的东西传进来的序号是 -1，取余得负数，x 变成 -2 倍半径，跑到筛子把手上
    const u = (i * 0.618 + 0.13) % 1, v = (i * 0.381 + 0.31) % 1;
    const x = (u * 2 - 1) * rx, y = -((v * 0.8) * 20) - (1 - Math.abs(x) / rx) * 10;
    return { x: cx + x, y: cy + y };
  }
  /* 筛子里的落点：向日葵式铺满整个网面，每 24 个一层往上堆 */
  function sieveSlot(i, cx, cy, rx) {
    const a = i * 2.39996 + 0.7, rr = Math.sqrt(((i % 24) + 0.5) / 24), layer = Math.floor(i / 24);
    return { x: cx + Math.cos(a) * rr * rx, y: cy + Math.sin(a) * rr * rx * 0.3 - layer * 8 - (1 - rr) * 6 };
  }
  /* 东西的「脚印」：几个代表点（相对中心）。铁钉取两端，其他取内接椭圆的 8 个点。和 drawRaw 的画法一致（先转再压扁）。 */
  function footprint(it, sc, rot) {
    const sq = 0.8, pts = [];
    if (it.elong) {
      const a = it.ax.ang + rot, L = it.len / 2 * sc;
      pts.push([Math.cos(a) * L, Math.sin(a) * L * sq], [-Math.cos(a) * L, -Math.sin(a) * L * sq], [0, 0]);
    } else {
      for (let k = 0; k < 8; k++) {
        const t = k / 8 * TAU, lx = Math.cos(t) * it.w / 2 * 0.9, ly = Math.sin(t) * it.h / 2 * 0.9;
        pts.push([(Math.cos(rot) * lx - Math.sin(rot) * ly) * sc, (Math.sin(rot) * lx + Math.cos(rot) * ly) * sc * sq]);
      }
    }
    return pts;
  }
  /* 筛网内部的椭圆（筛子图本地坐标，原点＝筛子图中心）：量自筛子图的网面 */
  const BASIN = { cx: 0, cy: null, rx: 112, ry: 31 };
  const basinOver = (x, y) => { const r = Math.hypot((x - BASIN.cx) / BASIN.rx, (y - BASIN.cy) / BASIN.ry); return Math.max(0, r - 1) * Math.min(BASIN.rx, BASIN.ry); };
  /* 把东西（中心 x,y）收进筛网椭圆：脚印的左右和下半都在里面才算，不够就往中心收；返回收好的位置。
     上半可以高出网面（堆起来本来就会冒出来）；整个脚印都要在扁椭圆里的话，东西一多会全挤到中线排成一串（大、小石头 40 颗） */
  function fitBasin(it, sc, rot, x, y) {
    const fp = footprint(it, sc, rot);
    const ok = (px, py) => fp.every(([dx, dy]) => basinOver(px + dx, py + Math.max(dy, 0)) <= 0);
    if (ok(x, y)) return { x, y };
    let lo = 0, hi = 1;
    for (let n = 0; n < 14; n++) { const m = (lo + hi) / 2; if (ok(BASIN.cx + (x - BASIN.cx) * m, BASIN.cy + (y - BASIN.cy) * m)) lo = m; else hi = m; }
    return { x: BASIN.cx + (x - BASIN.cx) * lo, y: BASIN.cy + (y - BASIN.cy) * lo };
  }
  function drawHeap(ctx, heap, ox, oy, shake) {
    const list = heap.slice().sort((a, b) => a.y - b.y);
    for (const h of list) {
      const j = shake ? Math.sin(performance.now() / 30 + h.x) * shake : 0;
      LAB.drawRaw(ctx, h.it, h.x + ox + j, h.y + oy, h.rot, h.sc, 0.8, 1);
    }
  }

  /* ───────── 筛子 ───────── */
  const SV_H = 215;
  function svGeom() { const w = A.tool_sieve.width * SV_H / A.tool_sieve.height; return { w, mouthDy: -0.215 * SV_H, mouthRx: w * 0.3, bottomDy: 0.4 * SV_H }; }
  T.tools.sieve = function (p) {
    const mix = S.mix, id = mix.id, liquid = !!mix.water, g = svGeom(), sv = LAB.SIEVE_POS;
    const fineKind = mix.base || null;
    const finePass = (!!mix.base && !mix.water) || liquid;             // 细料（沙、奶粉、面粉、沙和盐）和水会漏下去
    const fallK = {}; (mix.fall || []).forEach((k) => { fallK[k] = 1; });          // 比筛孔小、摇的时候一颗一颗漏下去的东西（目前没有混合物用到）
    const run = { tool: 'sieve', phase: 'move', t: 0, spr: { x: p.x, y: p.y, sc: p.sc }, off: 0, shakeDist: 0, fp: 0, heap: [], falling: [], nFall: 0, nFell: 0, fineAmt: 0, drag: null, need: 760, slotN: 0 };
    const mouth = { x: sv.x, y: sv.y + g.mouthDy };
    BASIN.cy = g.mouthDy;                // 筛网椭圆的中心就是「筛口」
    S.dish.fine = null; LAB.cam.focus(1.75, 457, 470);
    run.update = function (dt) {
      run.t += dt;
      if (run.phase === 'move') {
        const f = clamp(run.t / 0.6, 0, 1), e = easeIO(f);
        run.spr.x = lerp(p.x, sv.x, e); run.spr.y = lerp(p.y, sv.y, e) - Math.sin(f * Math.PI) * 30; run.spr.sc = lerp(p.sc, SV_H / TOOL_H, e);
        if (f >= 1) {
          run.phase = 'pour'; run.t = 0;
          run.pour = makePour({
            side: 'l', dur: 2.3, dest: { x: mouth.x + 20, y: mouth.y - 4 }, grains: liquid ? (mix.base || null) : fineKind, liquid: liquid ? mix.water : null,
            itemTarget: (it) => {
              const sc = HEAP_SC[it.kind], rot = it.elong ? rand(-0.6, 0.6) - it.ax.ang : rand(0, TAU);
              const s0 = sieveSlot(run.slotN++, 0, g.mouthDy + 6, BASIN.rx * 0.92), f = fitBasin(it, sc, rot, s0.x, s0.y);
              return { x: sv.x + f.x, y: sv.y + f.y, sc, rot };
            },
            onItem: (it, tg) => { run.heap.push({ it, bx: tg.x - sv.x, by: tg.y - sv.y, ox: 0, x: tg.x - sv.x, y: tg.y - sv.y, rot: tg.rot, sc: tg.sc, k: Math.random() }); if (fallK[it.kind]) run.nFall++; },
          });
        }
      } else if (run.phase === 'pour') {
        const P = run.pour; P.update(dt);
        if (fineKind && !liquid) run.fineAmt = Math.max(run.fineAmt, easeIO(P.f));
        if (liquid) {
          const f = clamp((P.f - 0.12) / 0.88, 0, 1);
          S.dish.liquid = { lv: 0.92 * f, mud: mix.water === 'muddy' ? 1 : 0, milk: mix.water === 'milky' ? 1 : 0 };
          if (mix.base) S.dish.fine = { kind: mix.base, amt: 0.7 * f };
          if (P.f > 0.1 && P.f < 0.97 && Math.random() < 0.8) LAB.fx.dot(sv.x + rand(-60, 60), sv.y + 56, rand(-14, 14), rand(60, 120), { r: rand(1.5, 2.6), c: mix.water === 'muddy' ? '#9a7745' : mix.water === 'milky' ? '#f4f1e8' : 'rgba(150,200,240,0.9)', g: 700, floor: DISH.floorCy + 2, decay: 2 });
        }
        if (P.done) {
          run.phase = 'shake'; run.t = 0;
          if (liquid) { T.after(1.2, () => T.finish(run)); tip(null); }
          else tip('左右拖动筛子，用力摇一摇');
        }
      } else if (run.phase === 'shake') {
        if (!run.drag) run.off *= Math.max(0, 1 - dt * 9);
        run.hintT = (run.hintT || 0) + dt;
      }
      run.settle(dt);
      // 漏下去的小石头：自由落体，落在浅盘里
      for (const q of run.falling) {
        q.vy += 1500 * dt; q.y += q.vy * dt; q.x += q.vx * dt; q.rot += q.vr * dt;
        if (q.y >= q.ty) { q.done = true; const d = LAB.dishAdd(q.it); d.x = q.tx; d.y = q.ty; d.rot = q.rot; run.nFell++; LAB.fx.puff(q.tx, q.ty, 2, 0.3, ['#9a9a9a'], q.ty + 6); }
      }
      run.falling = run.falling.filter((q) => !q.done);
    };
    /* 摇到某个进度，就放一颗小石头漏下去 */
    run.dropFallers = function () {
      if (!run.nFall) return;
      const want = Math.floor(clamp(run.fp / 0.92, 0, 1) * run.nFall + 0.0001);
      while (run.nFell + run.falling.length < want) {
        const i = run.heap.findIndex((h) => fallK[h.it.kind]); if (i < 0) break;
        const h = run.heap.splice(i, 1)[0], sl = LAB.dishSlot(S.dish.items.length + run.falling.length);
        run.falling.push({ it: h.it, x: sv.x + run.off + h.x, y: sv.y + h.y, vx: rand(-14, 14), vy: 60, vr: rand(-4, 4), rot: h.rot, tx: sl.x, ty: sl.y });
      }
    };
    /* 筛子里的东西：摇的时候有一点惯性滑动，但每一帧都收回筛网椭圆里，不会跑到把手或筛子外面 */
    run.settle = function (dt) {
      for (const h of run.heap) {
        h.ox *= Math.max(0, 1 - dt * 7);
        const f = fitBasin(h.it, h.sc, h.rot, h.bx + h.ox, h.by);
        h.x = f.x; h.y = f.y;
      }
    };
    /* 验收用：所有留在筛子上的东西，脚印超出筛网椭圆的最大距离（像素），0＝都在里面 */
    run.overflow = function () {
      let m = 0;
      for (const h of run.heap) for (const [dx, dy] of footprint(h.it, h.sc, h.rot)) m = Math.max(m, basinOver(h.x + dx, h.y + dy));
      return m;
    };
    run.down = function (q, qs) {
      if (run.phase !== 'shake' || run.finished || liquid) return;
      run.drag = { sx: qs.x, lx: qs.x }; tip(null);
    };
    run.move = function (q, qs) {
      const d = run.drag; if (!d) return;
      const dx = qs.x - d.lx; d.lx = qs.x;                     // 摇的距离按屏幕像素算，镜头推近后手感不变
      run.off = clamp((qs.x - d.sx) / LAB.cam.z, -48, 48);
      run.shakeDist += Math.abs(dx);
      if (finePass && run.fp < 1 && Math.abs(dx) > 1.5) {
        for (let i = 0; i < Math.min(4, 1 + Math.abs(dx) / 6); i++) LAB.fx.dot(sv.x + run.off + rand(-70, 70), sv.y + 54, rand(-20, 20), rand(20, 60), { r: rand(1.3, 2.5), c: pick(LAB.GRAIN[fineKind]), g: 800, floor: DISH.floorCy + rand(-6, 6), decay: 2.2 });
      }
      for (const h of run.heap) h.ox = clamp(h.ox - (dx / LAB.cam.z) * (0.45 + 0.4 * h.k), -34, 34);     // 筛子往右，东西往左滞后一点
      run.fp = clamp(run.shakeDist / run.need, 0, 1);
      run.dropFallers();
      if (finePass) { run.fineAmt = 1 - run.fp; S.dish.fine = { kind: fineKind, amt: 0.88 * run.fp }; }
      if (run.fp >= 1 && !run.finished && !run.fin) { run.fin = true; run.drag = null; T.after(0.7, () => T.finish(run)); }
    };
    run.up = function () { run.drag = null; };
    run.draw = function (ctx, now) {
      const s = run.spr, x = s.x + run.off, y = s.y;
      if (run.pour && run.phase === 'pour') run.pour.draw(ctx);
      LAB.softShadow(ctx, x + 22, y + 118, 120, 14, 0.18);
      const rot = run.off * 0.003;
      T.drawTool(ctx, 'sieve', x, y, TOOL_H * s.sc, rot);
      if (run.phase === 'move') return;
      // 筛子里的东西：细料堆 + 大块的东西（和筛子同一个旋转，所以永远相对筛网不动）
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      if (run.fineAmt > 0.02 && fineKind && !liquid) LAB.drawFineMound(ctx, 0, g.mouthDy + 18, g.mouthRx * 0.95 * Math.sqrt(run.fineAmt), 30 * run.fineAmt, fineKind);
      drawHeap(ctx, run.heap, 0, 0, 0);
      ctx.restore();
      for (const q of run.falling) LAB.drawRaw(ctx, q.it, q.x, q.y, q.rot, HEAP_SC[q.it.kind], 0.8, 1);
      // 摇的提示：左右箭头
      if (run.phase === 'shake' && !run.finished && !liquid && run.shakeDist < 60) {
        const a = 0.55 + 0.45 * Math.sin(now / 260), dx = Math.sin(now / 260) * 8;
        ctx.save(); ctx.fillStyle = `rgba(255,250,235,${a})`; ctx.strokeStyle = `rgba(90,60,20,${a * 0.7})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        for (const sgn of [-1, 1]) { const ax = x + sgn * (g.w / 2 + 34 + sgn * dx * 0 + Math.abs(dx) * 0.6 * sgn); ctx.beginPath(); ctx.moveTo(ax + sgn * 22, y - 8); ctx.lineTo(ax - sgn * 14, y - 30); ctx.lineTo(ax - sgn * 14, y + 14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
    };
    tip(null);
    return run;
  };

  /* ───────── 滤纸（漏斗）+ 放大镜 ───────── */
  const FN_H = 215;
  let FNM = null;
  function measureFunnel() {
    if (FNM) return FNM;
    const im = A.tool_funnel, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const rowMean = (y0, y1) => { let n = 0, s = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) { n++; s += x; } return n ? s / n : c.width / 2; };
    let bot = c.height - 1; while (bot > 0 && !rowHasAlpha(d, c.width, bot)) bot--;
    let top = 0; while (top < c.height && !rowHasAlpha(d, c.width, top)) top++;
    const tipX = rowMean(bot - 6, bot), mouthX = rowMean(top + 4, top + 20);
    FNM = { tipX: tipX / im.width, tipY: bot / im.height, mouthX: mouthX / im.width, mouthY: top / im.height };
    return FNM;
  }
  function rowHasAlpha(d, w, y) { for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) return true; return false; }

  LAB.measureFunnel = measureFunnel; LAB.drawWetPaste = drawWetSand;
  LAB.sieveOverflow = () => (T.run && T.run.tool === 'sieve' && T.run.overflow ? T.run.overflow() : null);
  T.tools.funnel = function (p) {
    const mix = S.mix, id = mix.id, liquid = !!mix.water, m = measureFunnel();
    const w = A.tool_funnel.width * FN_H / A.tool_funnel.height;
    const tip0 = LAB.FUNNEL_TIP;
    const fx = tip0.x - (m.tipX - 0.5) * w, fy = tip0.y - (m.tipY - 0.5) * FN_H;            // 漏斗图中心
    const mouth = { x: fx + (m.mouthX - 0.5) * w, y: fy + (m.mouthY - 0.5) * FN_H + 22 };
    LAB.cam.focus(1.5, 1067, 395);     // 对准点上移、倍率降到 1.5：漏斗口和滤纸完整落在工具栏（底 y≈190）下面
    const run = { tool: 'funnel', phase: 'move', t: 0, spr: { x: p.x, y: p.y, sc: p.sc }, heap: [], fineAmt: 0, drips: 0, dripT: 0, dripsDone: false, magT: -1, fin: false };
    const DRIPS = 36, LV = 0.6;
    const kind = mix.base;
    run.update = function (dt) {
      run.t += dt;
      if (run.phase === 'move') {
        const f = clamp(run.t / 0.7, 0, 1), e = easeIO(f);
        run.spr.x = lerp(p.x, fx, e); run.spr.y = lerp(p.y, fy, e) - Math.sin(f * Math.PI) * 40; run.spr.sc = lerp(p.sc, FN_H / TOOL_H, e);
        if (f >= 1) {
          run.phase = 'pour'; run.t = 0;
          run.pour = makePour({
            side: 'r', dur: 2.4, dest: { x: mouth.x - 4, y: mouth.y - 6 }, grains: kind, liquid: liquid ? mix.water : null,
            itemTarget: (it) => { const s = heapSlot((run.slotN = (run.slotN || 0) + 1) - 1, mouth.x, mouth.y + 6, w * 0.2); return { x: s.x, y: s.y, sc: HEAP_SC[it.kind] * 0.9, rot: it.elong ? rand(-0.6, 0.6) - it.ax.ang : rand(0, TAU) }; },
            onItem: (it, tg) => { run.heap.push({ it, x: tg.x - mouth.x, y: tg.y - mouth.y, rot: tg.rot, sc: tg.sc }); },
          });
        }
      } else if (run.phase === 'pour' || run.phase === 'drip') {
        const P = run.pour; if (!P.done) P.update(dt);
        if (kind) run.fineAmt = Math.max(run.fineAmt, easeIO(P.f));
        if (liquid && P.f > 0.15 && !run.dripsDone) {
          run.dripT -= dt;
          if (run.dripT <= 0) {
            run.dripT = 0.09; run.drips++;
            const ky = lerp(BEAK.inBottom - 6, BEAK.rimY + 38, S.beaker.lv);
            LAB.fx.drop(tip0.x, tip0.y + 2, { vy: 60, floorY: ky, c: mix.salty ? 'rgba(135,195,240,0.95)' : 'rgba(130,195,240,0.95)', onEnd: (d) => {
              S.beaker.lv = Math.min(LV, S.beaker.lv + LV / DRIPS);
              LAB.fx.dot(d.x, d.y, rand(-40, 40), rand(-90, -40), { r: 1.6, c: 'rgba(210,235,255,0.9)', g: 500, decay: 3 });
            } });
            if (run.drips >= DRIPS) run.dripsDone = true;
          }
          if (mix.salty) S.beaker.salty = true;
        }
        if (P.done && run.phase === 'pour') { run.phase = 'drip'; run.t = 0; }
        if (mix.mag && run.magT < 0 && P.f > 0.25) { run.magT = 0; T.after(0, () => {}); }
        if (run.magT >= 0) run.magT += dt;
        if (!run.fin) {
          if (liquid) {
            if (run.dripsDone && S.beaker.lv >= LV - 0.001 && P.done && (!mix.mag || run.magT > 5.2)) { run.fin = true; T.after(0.4, () => T.finish(run)); }
          } else if (P.done && run.t > 1.0) { run.fin = true; T.finish(run); }
        }
      }
    };
    run.draw = function (ctx, now) {
      const s = run.spr;
      if (run.pour && run.phase === 'pour') run.pour.draw(ctx);
      LAB.softShadow(ctx, s.x + 24, 560, 80, 10, 0.1);
      T.drawTool(ctx, 'funnel', s.x, s.y, TOOL_H * s.sc, 0);
      if (run.phase === 'move') return;
      if (kind && run.fineAmt > 0.02) {
        if (liquid) drawWetSand(ctx, mouth.x, mouth.y - 2, w * 0.3, run.fineAmt, kind);          // 滤纸里留下的深色湿沙
        else LAB.drawFineMound(ctx, mouth.x, mouth.y + 14, w * 0.2 * Math.sqrt(run.fineAmt), 16 * run.fineAmt, kind);
      }
      if (mix.mag && P0done(run)) drawWetPaper(ctx, mouth.x, mouth.y - 2, w * 0.3);
      drawHeap(ctx, run.heap, mouth.x, mouth.y, 0);
    };
    run.drawScreen = function (ctx, now) { if (run.magT >= 0 && mix.mag) drawMagnifier(ctx, now, run.magT, LAB.cam.toScreen(mouth)); };
    tip(null);
    return run;
  };

  /* 放大镜（屏幕层，不随镜头缩放）：浅色滤纸横跨中间，一个个圆形小孔；盐是白色小方块加淡蓝描边，持续穿过小孔；
     水淡蓝半透明往下流；有沙时大沙粒停在滤纸上面过不去。示意图，程序画。 */
  const MAG = { x: 650, y: 535, r: 200 };
  let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;     // 固定伪随机，每次画一样
  const HOLES = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 9; i++) {
    const x = -178 + i * 44 + (j ? 22 : 0) + (rnd() - 0.5) * 16, y = (j ? 13 : -12) + (rnd() - 0.5) * 8, r = 10 + rnd() * 6;
    if (Math.hypot(x, y) < MAG.r - 40) HOLES.push({ x, y, r });
  }
  const SALT_P = [];
  for (let i = 0; i < 30; i++) SALT_P.push({ h: (i * 7) % HOLES.length, ph: (i * 0.173) % 1, sp: 0.75 + ((i * 0.53) % 1) * 0.5, sz: 8 + ((i * 0.29) % 1) * 3, rot: i * 0.7 });
  const PAPER = new Path2D(); PAPER.rect(-MAG.r, -34, MAG.r * 2, 68); HOLES.forEach((h) => { PAPER.moveTo(h.x + h.r, h.y); PAPER.arc(h.x, h.y, h.r, 0, TAU, true); });
  const FIBERS = []; for (let i = 0; i < 260; i++) FIBERS.push([(rnd() - 0.5) * 2 * MAG.r, -34 + rnd() * 68, (rnd() - 0.5) * 16, (rnd() - 0.5) * 4]);
  function label(ctx, text, x, y) {
    ctx.font = '900 25px "Noto Sans SC", sans-serif'; const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.93)'; ctx.strokeStyle = 'rgba(70,90,120,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 22, w, 40, 20) : ctx.rect(x - w / 2, y - 22, w, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#25405e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.textBaseline = 'alphabetic';
  }
  function drawMagnifier(ctx, now, mt, mouth) {
    const pop = clamp(mt / 0.45, 0, 1), sc = pop < 1 ? 1 + 0.1 * Math.sin(pop * Math.PI) - (1 - ease(pop)) * 0.8 : 1;
    if (sc <= 0.05) return;
    const { x, y, r } = MAG, hasSand = false;
    ctx.save();
    // 从漏斗滤纸射向放大镜的光锥
    const a = Math.min(1, mt * 2) * 0.3;
    ctx.fillStyle = `rgba(255,248,220,${a})`; ctx.beginPath(); ctx.moveTo(mouth.x - 14, mouth.y + 6); ctx.lineTo(mouth.x + 14, mouth.y + 60);
    ctx.lineTo(x + r * 0.9, y + 40); ctx.lineTo(x + r * 0.9, y - 120); ctx.closePath(); ctx.fill();
    ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.save(); ctx.rotate(2.35);                               // 把手
    const hg = ctx.createLinearGradient(0, -15, 0, 15); hg.addColorStop(0, '#b8793c'); hg.addColorStop(0.5, '#8a5224'); hg.addColorStop(1, '#5e3515');
    ctx.fillStyle = hg; ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r + 4, -15, 96, 30, 15) : ctx.rect(r + 4, -15, 96, 30); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.shadowColor = 'rgba(40,25,5,0.4)'; ctx.shadowBlur = 28; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 14;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 9, 0, TAU); ctx.clip();
    // 底：上面是淡蓝的水，下面是穿过后的清水
    const bg = ctx.createLinearGradient(0, -r, 0, r); bg.addColorStop(0, '#dff0fb'); bg.addColorStop(0.45, '#cfe7f7'); bg.addColorStop(1, '#eaf5fc');
    ctx.fillStyle = bg; ctx.fillRect(-r, -r, r * 2, r * 2);
    // 水往下流：淡蓝的细流（穿过小孔的更亮）
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const gx = -r + 14 + ((i * 0.6180339) % 1) * (r * 2 - 28), sp = 60 + ((i * 0.37) % 1) * 50, ph = (i * 0.211) % 1;
      const yy = ((mt * sp / (r * 2) + ph) % 1) * r * 2 - r;
      ctx.strokeStyle = `rgba(120,185,235,${yy < -34 ? 0.45 : 0.25})`; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx, yy + 26); ctx.stroke();
    }
    // 盐：白色小方块 + 淡蓝描边，对准小孔往下穿
    for (const sp of SALT_P) {
      const h = HOLES[sp.h], yy = lerp(-r + 12, r - 12, (mt * 0.2 * sp.sp + sp.ph) % 1), xx = h.x + Math.sin(mt * 2 + sp.rot) * Math.max(0, h.r - 8) * 0.5;
      if (Math.hypot(xx, yy) > r - 14) continue;
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(sp.rot * 0.2 + mt * 0.6);
      ctx.fillStyle = 'rgba(60,100,150,0.22)'; ctx.fillRect(-sp.sz / 2 + 2, -sp.sz / 2 + 2.5, sp.sz, sp.sz);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(110,175,235,0.95)'; ctx.lineWidth = 1.8; ctx.fillRect(-sp.sz / 2, -sp.sz / 2, sp.sz, sp.sz); ctx.strokeRect(-sp.sz / 2, -sp.sz / 2, sp.sz, sp.sz);
      ctx.fillStyle = 'rgba(190,225,255,0.9)'; ctx.fillRect(-sp.sz / 2 + 1.5, -sp.sz / 2 + 1.5, sp.sz * 0.35, sp.sz * 0.35);
      ctx.restore();
    }
    // 滤纸：浅色横带，带圆孔（evenodd），上缘亮、下缘暗，孔内壁有一圈阴影
    ctx.save(); ctx.shadowColor = 'rgba(70,50,20,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
    const pg = ctx.createLinearGradient(0, -34, 0, 34); pg.addColorStop(0, '#fffaf0'); pg.addColorStop(0.5, '#f4ead4'); pg.addColorStop(1, '#dccfb0');
    ctx.fillStyle = pg; ctx.fill(PAPER, 'evenodd'); ctx.restore();
    ctx.save(); ctx.clip(PAPER, 'evenodd'); ctx.strokeStyle = 'rgba(150,125,85,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); for (const f of FIBERS) { ctx.moveTo(f[0], f[1]); ctx.lineTo(f[0] + f[2], f[1] + f[3]); } ctx.stroke(); ctx.restore();
    for (const h of HOLES) {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.strokeStyle = 'rgba(140,110,70,0.55)'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 2.2, Math.PI * 1.05, Math.PI * 1.95); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // 标签 + 引线
    const sp0 = SALT_P[2], hh = HOLES[sp0.h], sy = lerp(-r + 12, r - 12, (mt * 0.2 * sp0.sp + sp0.ph) % 1);
    ctx.strokeStyle = 'rgba(37,64,94,0.75)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -112); ctx.lineTo(hh.x - 4, Math.min(sy, -44)); ctx.stroke();
    const h5 = HOLES[Math.min(5, HOLES.length - 1)];
    ctx.beginPath(); ctx.moveTo(40, 108); ctx.lineTo(h5.x + 4, h5.y + h5.r * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(h5.x + 4, h5.y + h5.r * 0.6, 4, 0, TAU); ctx.fillStyle = '#25405e'; ctx.fill();
    label(ctx, '盐的颗粒非常小', 0, -134); label(ctx, '滤纸的小孔', 40, 112);
    ctx.restore();
    // 镜框：金属环 + 玻璃反光
    const rg = ctx.createLinearGradient(-r, -r, r, r); rg.addColorStop(0, '#f4f6f8'); rg.addColorStop(0.5, '#9aa4ae'); rg.addColorStop(1, '#5b6570');
    ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, TAU); ctx.strokeStyle = rg; ctx.lineWidth = 16; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 13, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 30, Math.PI * 1.1, Math.PI * 1.42); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }

  /* ───────── 蒸发（太阳）───────── */
  /* 太阳和天空弧线画在屏幕层（镜头推近到浅盘时，弧线仍然完整可见，可以从左拖到右） */
  T.tools.sun = function (p) {
    const mix = S.mix, id = mix.id, fromBeaker = mix.src === 'beaker', liquid = !!mix.water || fromBeaker, sk = LAB.SKY;
    const liqKind = fromBeaker ? 'clear' : mix.water, mud = liqKind === 'muddy' ? 1 : 0, milk = liqKind === 'milky' ? 1 : 0;
    const hk0 = S.sunHook; LAB.cam.focus.apply(LAB.cam, hk0 && hk0.cam ? hk0.cam : [1.75, 457, 470]);
    const run = { tool: 'sun', phase: 'move', t: 0, spr: { x: p.x, y: p.y, sc: p.sc }, prog: 0, tgt: 0, drag: null, steamT: 0, hintT: 0, fin: false };
    const pos = (t) => bez(sk.p0, sk.c, sk.p1, t);
    const tFromX = (x) => clamp((x - sk.p0.x) / (sk.p1.x - sk.p0.x), 0, 1);     // 控制点在正中，x 对 t 是线性的
    run.pos = pos;
    S.dish.fine = null;
    const hk = S.sunHook; S.sunHook = null;       // 两杯找盐接手：自己的倒法、自己的水渍（chain.js 在拿起太阳前设）
    run.update = function (dt) {
      run.t += dt;
      if (run.phase === 'move') {
        const f = clamp(run.t / 0.7, 0, 1), e = easeIO(f), q = pos(0);
        run.spr.x = lerp(p.x, q.x, e); run.spr.y = lerp(p.y, q.y, e) - Math.sin(f * Math.PI) * 30; run.spr.sc = lerp(p.sc, 0.85, e);
        if (f >= 1) {
          // 原则：工具的动作对每个混合物都一样。任何混合物都先从大碗倒进浅盘，再拖太阳；干的东西晒了没变化，结果卡照真值表
          run.phase = 'pour'; run.t = 0; run.slotN = 0;
          run.pour = hk ? hk.makePour(run) : makePour({
            side: 'l', dur: 2.2, dest: { x: DISH.cx + 24, y: DISH.floorCy - 10 }, grains: mix.base, liquid: liqKind, src: mix.src,
            itemTarget: (it) => { const sl = LAB.dishSlot(run.slotN++); return { x: sl.x, y: sl.y, sc: LAB.DISH_SC[it.kind] || 0.7, rot: it.elong ? rand(-0.5, 0.5) - it.ax.ang : rand(0, TAU) }; },
            onItem: (it, tg) => { const d = LAB.dishAdd(it); d.x = tg.x; d.y = tg.y; d.rot = tg.rot; LAB.fx.puff(tg.x, tg.y, 4, 0.4, it.kind === 'leaf' ? ['#b0763a'] : ['#c9c3b8'], tg.y + 8); },
          });
        }
      } else if (run.phase === 'pour') {
        const P = run.pour; P.update(dt);
        const f = easeIO(clamp((P.f - 0.1) / 0.9, 0, 1));
        if (hk) { if (P.done) startSun(); return; }
        if (liquid) S.dish.liquid = { lv: f, mud, milk };
        if (mix.base && mix.water) S.dish.fine = { kind: mix.base, amt: 0.62 * f, wide: 0.8, tall: 0.16, wet: 1 };
        else if (mix.base) S.dish.fine = { kind: mix.base, amt: 0.7 * f, wide: 0.9 };          // 干的细料（沙／奶粉／面粉）在盘里堆成一小堆
        if (P.done) startSun();
      } else if (run.phase === 'sun') {
        run.hintT += dt;
        run.prog += (run.tgt - run.prog) * Math.min(1, dt * 8);
        const pr = run.prog;
        S.sunLight = Math.sin(Math.PI * clamp(pr, 0, 1)) * 0.9;
        if (hk) hk.sunTick(pr, run, dt);
        else if (liquid) {
          const ev = easeIO(clamp(pr / 0.82, 0, 1));
          S.dish.liquid = { lv: 1 - ev, mud, milk };
          if (mix.base && mix.water) S.dish.fine = { kind: mix.base, amt: 0.62, wide: 0.8, tall: 0.16, wet: 1 - ev };      // 湿沙／湿面粉晒干，只是薄薄一层
          if (mix.salty) S.dish.salt = smooth(clamp((pr - 0.28) / 0.66, 0, 1));
          run.steamT -= dt;
          if (pr > 0.02 && ev < 0.97 && run.steamT <= 0) {
            run.steamT = 0.07; const k = Math.sqrt(1 - ev);
            LAB.fx.steam(DISH.cx + rand(-1, 1) * 150 * k, DISH.floorCy - 10);
          }
        }
        if (pr >= 0.985 && !run.fin) { run.fin = true; run.drag = null; T.after(0.8, () => T.finish(run)); }
      }
    };
    function startSun() { run.phase = 'sun'; run.t = 0; tip('拖着太阳，沿着天空走一圈'); }
    run.down = function (q, qs) {
      if (run.phase !== 'sun' || run.fin) return;
      const s = pos(run.prog);
      if (Math.hypot(qs.x - s.x, qs.y - s.y) < 130) { run.drag = { dx: s.x - qs.x }; tip(null); }
    };
    run.move = function (q, qs) { if (run.drag) run.tgt = Math.max(run.tgt, tFromX(qs.x + run.drag.dx)); };   // 只能往前走：时间不会倒流
    run.up = function () { run.drag = null; };
    run.draw = function (ctx) { if (run.pour && run.phase === 'pour') run.pour.draw(ctx); };
    run.drawScreen = function (ctx, now) {
      const s = run.phase === 'move' ? run.spr : Object.assign({}, pos(run.phase === 'pour' ? 0 : run.prog), { sc: 0.85 });
      if (run.phase !== 'move') {          // 柔和的虚线弧
        ctx.save(); ctx.setLineDash([1, 17]); ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.shadowColor = 'rgba(255,200,80,0.7)'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(sk.p0.x, sk.p0.y); ctx.quadraticCurveTo(sk.c.x, sk.c.y, sk.p1.x, sk.p1.y); ctx.stroke(); ctx.restore();
      }
      const R = 150 + 12 * Math.sin(now / 500);
      const gl = ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, R); gl.addColorStop(0, 'rgba(255,236,150,0.6)'); gl.addColorStop(1, 'rgba(255,236,150,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, TAU); ctx.fill();
      T.drawTool(ctx, 'sun', s.x, s.y, TOOL_H * s.sc, now / 4000);
      if (run.phase === 'sun' && run.prog < 0.04 && !run.drag) {
        const a = 0.6 + 0.4 * Math.sin(now / 260), ax = s.x + 110 + Math.sin(now / 260) * 8;
        ctx.save(); ctx.fillStyle = `rgba(255,250,235,${a})`; ctx.strokeStyle = `rgba(150,90,10,${a * 0.8})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ax + 34, s.y + 10); ctx.lineTo(ax, s.y - 14); ctx.lineTo(ax, s.y + 34); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    };
    tip(null);
    return run;
  };
})();
