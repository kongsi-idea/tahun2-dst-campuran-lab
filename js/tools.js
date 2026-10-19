/* 分离大法实验室 · 工具行为（核心 + 用手、漂浮、磁铁）。筛子、滤纸、蒸发在 flows.js。
   所有动画都由 update(dt) 推进（dt 受暂停控制），计时用 T.after，不用 setTimeout。 */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { W, H, GEO, S, A, rand, clamp, lerp, smooth, pick, shuffle } = LAB;
  const { BOWL, DISH, BEAK } = GEO;
  const TAU = Math.PI * 2;
  LAB.hooks = LAB.hooks || {};         // 连环关／两杯找盐／闯关接手用的钩子（chain.js、modes.js 设置）
  const T = LAB.T = { held: null, run: null, dirty: false, timers: [], clock: 0, fly: [], overlay: [], tools: {} };

  /* 工具卡（DOM）的位置：由 ui.js 的工具栏排版算出（6 张或连环关 7 张），图中心 y ≈ 88 */
  const cardPos = (k) => LAB.ui.cardCenter(k);
  T.cardPos = cardPos;
  const TOOL_H = 150;
  const HAND_TIP_DY = 110;           // 拿着手的时候，指尖在鼠标下面 110px（手背朝上，手腕在上方，不会伸出屏幕顶）
  const overBowl = (p) => p.x > BOWL.cx - 390 && p.x < BOWL.cx + 390 && p.y > 300 && p.y < 730;
  T.overBowl = overBowl;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIO = smooth;
  LAB.ease = ease;

  function drawTool(ctx, k, x, y, h, rot, alpha) {
    if (k === 'hand') { LAB.drawHand(ctx, 'open', x, y + h / 2, h, alpha); return; }     // 手：(x,y) 是图框中心，指尖在框底
    const im = A['tool_' + k], s = h / im.height;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -im.width * s / 2, -h / 2, im.width * s, h); ctx.restore();
  }
  T.drawTool = drawTool;

  T.after = (sec, fn) => T.timers.push({ t: sec, fn });
  const toast = (m) => LAB.ui.toast(m);
  const tip = (m) => LAB.ui.tip(m);

  /* 工具飞到某处（回卡片、移到筛子位置等）。 */
  T.flyTool = function (o) {
    const f = Object.assign({ t: 0, dur: 0.5, rot: 0, trot: 0, sc: 1, tsc: 1 }, o);
    f.x0 = o.x; f.y0 = o.y; f.rot0 = f.rot; f.sc0 = f.sc;
    T.fly.push(f); return f;
  };
  T.sendBack = function (key, from) {
    const c = cardPos(key);
    T.flyTool({ key, x: from.x, y: from.y, sc: from.sc || 1.2, tx: c.x, ty: c.y, tsc: 104 / TOOL_H, rot: from.rot || 0, trot: 0, dur: 0.45, lift: 40, screen: true, onEnd: () => { LAB.ui.setCardAway(key, false); } });
  };

  /* ───────── 抓起 / 放下 ───────── */
  T.grab = function (key, p) {
    if (T.held) return;
    if (LAB.hooks.canGrab && LAB.hooks.canGrab(key) === false) return;
    if (LAB.ui.mixId === 'empty') { LAB.ui.mixId = 'nails'; LAB.ui.chosen = true; LAB.ui.resetMix(); }     // 没选混合物就直接拿工具（跳步）：用默认的铁钉和沙
    if (T.dirty) { if (LAB.hooks.resetForGrab) LAB.hooks.resetForGrab(key); else LAB.ui.resetMix(); }
    T.held = { tool: key, x: p.x, y: p.y - 30, dx: 0, dy: -30, sc: 1, tsc: key === 'magnet' ? 1.3 : 1.2, returning: false, locked: false, rot: 0 };
    LAB.ui.setCardAway(key, true);
    LAB.ui.hideResult();
    if (key === 'magnet') { T.dirty = true; startMagnet(); tip('把磁铁拿到碗上方，慢慢移动'); }
    else tip('把它拖到大碗上，放开');
  };
  T.move = function (p) {
    const h = T.held; if (!h || h.returning || h.locked) return;
    h.x = clamp(p.x + h.dx, 70, W - 70); h.y = clamp(p.y + h.dy, 90, h.tool === 'hand' ? H - 70 - HAND_TIP_DY : H - 70);
  };
  T.release = function (p) {
    const h = T.held; if (!h) return;
    if (h.locked) return;
    if (h.tool === 'magnet') { magnetRelease(); return; }
    const probe = { x: h.x, y: h.y + (h.tool === 'hand' ? HAND_TIP_DY + 30 : 30) };      // 手：用指尖判断在不在碗上
    const target = LAB.hooks.dropTarget ? LAB.hooks.dropTarget(probe, h) : (overBowl(probe) ? {} : null);
    if (target) {
      T.held = null; T.dirty = true;
      tip(null);
      const begin = (LAB.hooks.begin && LAB.hooks.begin(h.tool, target)) || T.tools[h.tool];
      T.run = begin({ x: h.x, y: h.y, sc: h.sc, rot: 0, target });
    } else {
      T.held = null; T.sendBack(h.tool, { x: h.x, y: h.y, sc: h.sc });
      toast(LAB.hooks.dropMsg ? LAB.hooks.dropMsg() : '把工具拖到大碗上再放开');
    }
  };

  T.reset = function () {
    T.held = null; T.run = null; T.dirty = false; T.timers = []; T.fly = []; T.overlay = [];
    S.bowlStream = null; LAB.cam.reset();
    LAB.ui.tip(null); LAB.ui.hideResult();
    LAB.TOOLS.forEach((t) => LAB.ui.setCardAway(t.key, false));
  };

  T.finish = function (run) {
    if (run.finished) return; run.finished = true;
    if (LAB.hooks.finish && LAB.hooks.finish(run) === true) { tip(null); return; }
    const m = S.mix.id, tool = run.tool;
    const [kind] = LAB.TRUTH[m][tool];
    LAB.ui.showResult(m, tool);
    if (kind === 'ok') LAB.glow(LAB.GLOW[tool], LAB.clock);
    tip(null);
  };

  /* ───────── 每帧推进 ───────── */
  T.update = function (dt) {
    T.clock += dt;
    for (const m of T.timers) m.t -= dt;
    const due = T.timers.filter((m) => m.t <= 0); T.timers = T.timers.filter((m) => m.t > 0);
    due.forEach((m) => m.fn());
    const h = T.held;
    if (h) {
      h.sc += (h.tsc - h.sc) * Math.min(1, dt * 12);
      if (h.returning) {
        const c = cardPos(h.tool);
        h.x += (c.x - h.x) * Math.min(1, dt * 10); h.y += (c.y - h.y) * Math.min(1, dt * 10);
        if (Math.hypot(c.x - h.x, c.y - h.y) < 6) { T.held = null; LAB.ui.setCardAway(h.tool, false); }
      }
    }
    for (const f of T.fly) {
      f.t += dt / f.dur; const e = easeIO(f.t);
      f.x = lerp(f.x0, f.tx, e); f.y = lerp(f.y0, f.ty, e) - Math.sin(clamp(f.t, 0, 1) * Math.PI) * (f.lift || 0);
      f.sc = lerp(f.sc0, f.tsc, e); f.rot = lerp(f.rot0, f.trot, e);
      if (f.t >= 1 && !f.done) { f.done = true; if (f.onEnd) f.onEnd(f); }
    }
    T.fly = T.fly.filter((f) => !f.done);
    if (T.mag) updateMagnet(dt);
    if (T.run && T.run.update) T.run.update(dt);
    updateWaterDrift(dt);
  };

  /* ───────── 画（前景：工具、飞行中的东西、水流） ───────── */
  T.draw = function (ctx, now) {
    // 倒进碗里的水流：碗口以上的那一段画在最上层，碗内的那段在 scene 里画
    if (S.bowlStream) { ctx.save(); const r = new Path2D(); r.rect(0, 0, W, BOWL.rimY + 2); ctx.clip(r); S.bowlStream(ctx, now); ctx.restore(); }
    if (T.run && T.run.draw) T.run.draw(ctx, now);
    for (const f of T.fly) {
      if (f.screen) continue;
      LAB.softShadow(ctx, f.x + 30, clamp(f.y + 150, 300, 760), 70, 13, 0.15);
      drawTool(ctx, f.key, f.x, f.y, TOOL_H * f.sc, f.rot);
    }
    drawFlyingItems(ctx, now);
  };
  /* 屏幕层（不随镜头缩放）：被拿着的工具、飞回工具栏的工具、太阳和放大镜 */
  T.drawScreen = function (ctx, now) {
    if (T.run && T.run.drawScreen) T.run.drawScreen(ctx, now);
    for (const f of T.fly) {
      if (!f.screen) continue;
      LAB.softShadow(ctx, f.x + 30, clamp(f.y + 150, 300, 760), 70, 13, 0.15);
      drawTool(ctx, f.key, f.x, f.y, TOOL_H * f.sc, f.rot);
    }
    const h = T.held;
    if (h) {
      const lifted = h.y < 640;
      if (lifted) LAB.softShadow(ctx, h.x + 34, clamp(h.y + 210, 320, 760), 84, 16, 0.2);
      if (h.tool === 'hand') LAB.drawHand(ctx, 'open', h.x, h.y + 30 + HAND_TIP_DY, 140 * h.sc);
      else drawTool(ctx, h.tool, h.x, h.y, TOOL_H * h.sc, h.rot);
    }
    for (const o of T.overlay) o(ctx, now);
  };

  /* 离开碗的东西（飞行、被吸住、被手拿着、落下）都在前景画 */
  function drawFlyingItems(ctx) {
    for (const it of S.items) {
      if (it.state === 'rest' || it.state === 'gone' || it.state === 'float') continue;
      if (it.state === 'stuck' || it.state === 'fly') {
        const sq = it.state === 'fly' ? lerp(it.squash, 1, clamp(it.t, 0, 1)) : 1;
        LAB.drawRaw(ctx, it, it.x, it.y, it.rot, 1, sq, it.alpha);
      } else {
        LAB.drawRaw(ctx, it, it.x, it.y, it.rot, it.fsc == null ? 1 : it.fsc, it.fsq == null ? 1 : it.fsq, it.alpha);
      }
    }
  }

  /* 被选中（排队等手来拿）的东西画一圈光 */
  T.ringItem = function (ctx, it, now) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,220,80,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(it.x, it.y, it.len * 0.42 + 6, it.len * 0.26 + 4, 0, 0, TAU); ctx.stroke(); ctx.restore();
  };

  /* ───────── 用手 ─────────
     手掌朝下的手（open 悬停／grab 抓住／point 示范）。run.hand.x/y 是「指尖」的世界坐标，换姿势时以指尖底部中点对齐。
     手画在屏幕层（在 DOM 工具栏上面），所以任何位置都不会被工具栏盖住；物件画在世界层，永远在手指下面。 */
  const HAND_H = 130, HOVER = { x: BOWL.cx + 290, y: 440 };     // 世界坐标 130px 高；镜头 1.3 倍时约 169px，和拿在手上的大小一样
  const HAND_CAM = { z: 1.3, x: 640, y: 490 };                    // 镜头对准点：悬停的手整只落在工具栏（底 y≈192）下面
  T.tools.hand = function (p) {
    const mix = S.mix;
    const tip0 = { x: p.x, y: p.y + HAND_TIP_DY + 30 }, hs0 = 140 * p.sc;       // 放开时手的指尖（屏幕坐标）与高度
    const w0 = LAB.cam.toWorld(tip0), z0 = LAB.cam.z;
    LAB.cam.focus(HAND_CAM.z, HAND_CAM.x, HAND_CAM.y);
    const run = { tool: 'hand', hand: { x: w0.x, y: w0.y, hs: hs0 / z0, pose: 'open' }, queue: [], cur: null, picks: 0, cascade: false, leakT: 0, mt: 0 };
    const isPickable = (it) => it.state === 'rest' && !it.queued && (mix.layout === 'pile' ? it.depth !== 'bury' && it.depth !== 'side' : mix.layout === 'floor' ? true : (it.depth === 'surf' || it.depth === 'half'));
    run.isPickable = isPickable;
    run.moving = true;
    run.update = function (dt) {
      const hd = run.hand;
      if (run.moving) {
        run.mt += dt; const f = clamp(run.mt / 0.45, 0, 1), e = easeIO(f);
        hd.x = lerp(w0.x, HOVER.x, e); hd.y = lerp(w0.y, HOVER.y, e) - Math.sin(f * Math.PI) * 30; hd.hs = lerp(hs0 / z0, HAND_H, e);
        if (f >= 1) { run.moving = false; hd.x = HOVER.x; hd.y = HOVER.y; hd.hs = HAND_H; }
        return;
      }
      if (!run.cur && run.queue.length) startPick(run, run.queue.shift());
      const c = run.cur;
      if (c) {
        c.t += dt * (run.mul || 1) / c.dur;
        const f = clamp(c.t, 0, 1);
        if (c.phase === 'to') {            // 张开的手往下伸到物件上
          const e = ease(f); const tx = c.it.x, ty = c.it.y + 6;
          hd.x = lerp(c.hx, tx, e); hd.y = lerp(c.hy, ty, e); hd.pose = 'open';
          if (f >= 1) { hd.pose = 'grab'; c.phase = 'carry'; c.t = 0; c.dur = run.fast ? 0.42 : 0.75; c.it.state = 'carry'; c.it.queued = false; c.it.fsc = 1; c.it.alpha = 1; c.from = { x: c.it.x, y: c.it.y }; }     // 抓住：换 grab
        } else if (c.phase === 'carry') {  // 捏着走到左边的盘子上方
          const e = easeIO(f), sl = c.slot, ty = sl.y - 38;
          const x = lerp(c.from.x, sl.x, e), y = lerp(c.from.y, ty, e) - Math.sin(f * Math.PI) * 90;
          c.it.x = x; c.it.y = y; c.it.fsc = lerp(1, sl.sc, e); c.it.fsq = lerp(1, 0.8, e); c.it.rot += (sl.rot - c.it.rot) * Math.min(1, dt * 6);
          hd.x = x; hd.y = y + 6 + 2 * Math.sin(f * 9); hd.pose = 'grab';
          if (f >= 1) { c.phase = 'drop'; c.t = 0; c.dur = run.fast ? 0.2 : 0.26; hd.pose = 'open'; c.dropFrom = { x, y }; }       // 放开：换回 open，物件掉下去
        } else if (c.phase === 'drop') {
          const sl = c.slot, e = f * f;
          c.it.y = lerp(c.dropFrom.y, sl.y, e); c.it.x = lerp(c.dropFrom.x, sl.x, e); c.it.fsc = lerp(c.it.fsc, sl.sc, 0.3);
          hd.y = c.dropFrom.y + 6 - 16 * ease(f); hd.pose = 'open';
          if (f >= 1) {
            const d = LAB.dishAdd(c.it); d.x = sl.x; d.y = sl.y; d.rot = sl.rot;
            c.it.state = 'gone'; run.picks++;
            LAB.fx.puff(sl.x, sl.y, c.it.kind === 'pebble' ? 2 : 4, 0.4, c.it.kind === 'leaf' ? ['#b0763a'] : ['#c9c3b8'], sl.y + 8);
            c.phase = 'back'; c.t = 0; c.dur = run.fast ? 0.14 : 0.32; c.hx = hd.x; c.hy = hd.y;
          }
        } else if (c.phase === 'back') {
          const e = ease(f);
          if (!run.queue.length) { hd.x = lerp(c.hx, HOVER.x, e); hd.y = lerp(c.hy, HOVER.y, e); }
          if (f >= 1) { run.cur = null; afterPick(run); }
        } else if (c.phase === 'leak') {   // 太细：抓下去（grab），抬起时从指缝漏，再张开（open）
          const e = f < 0.4 ? ease(f / 0.4) : f < 0.6 ? 1 : 1 - ease((f - 0.6) / 0.4);
          hd.x = lerp(HOVER.x, c.px, e); hd.y = lerp(HOVER.y, c.py + 4, e);
          hd.pose = f >= 0.4 && f < 0.8 ? 'grab' : 'open';
          if (!c.fired && f > 0.45) {
            c.fired = true;
            if (c.water) { LAB.fx.puff(c.px, c.py, 14, 1.4, ['rgba(160,210,245,0.9)', '#fff'], c.py + 18); LAB.fx.drop(c.px, c.py, { vy: -220, vx: rand(-40, 40), floorY: c.py + 24 }); }
          }
          if (f > 0.5 && f < 0.82 && !c.water) {           // 抬手的时候，沙／粉从指缝一直漏下去
            for (let i = 0; i < 2; i++) LAB.fx.dot(hd.x + rand(-16, 16), hd.y - 8 + rand(-6, 6), rand(-14, 14), rand(10, 60), { r: rand(1.3, 2.6), c: pick(c.cols), g: 640, floor: c.py + 44, decay: 0.9 });
          }
          if (f >= 1) { run.cur = null; hd.pose = 'open'; if (c.then) c.then(); }
        }
      }
    };
    run.draw = function (ctx, now) {
      for (const it of S.items) if (it.queued && it.state === 'rest') T.ringItem(ctx, it, now);
      const hd = run.hand;
      if (!run.moving) LAB.softShadow(ctx, hd.x + 26, hd.y + 14, 48, 9, 0.14);
    };
    run.drawScreen = function (ctx, now) {       // 屏幕层：画在工具栏上面
      const hd = run.hand, cam = LAB.cam;
      const bob = !run.cur && !run.moving ? Math.sin(now / 420) * 5 : 0;
      const sp = cam.toScreen({ x: hd.x, y: hd.y + bob });
      LAB.drawHand(ctx, hd.pose, sp.x, sp.y, hd.hs * cam.z);
    };
    tip(null);
    return run;
  };
  function startPick(run, it) {
    const sl = LAB.dishSlot(S.dish.items.length + run.queue.length * 0);
    run.cur = { phase: 'to', t: 0, dur: run.fast ? 0.12 : 0.3, it, hx: run.hand.x, hy: run.hand.y, slot: { x: sl.x, y: sl.y, sc: LAB.DISH_SC[it.kind] || 0.7, rot: rand(-0.4, 0.4) } };
  }
  function afterPick(run) {
    const mix = S.mix;
    const left = S.items.filter((it) => run.isPickable(it));
    if (mix.layout === 'pile' || mix.layout === 'floor') {
      if (!run.cascade && run.picks >= (mix.layout === 'floor' ? 3 : 4) && left.length) {
        run.cascade = true; run.fast = true; tip(null); run.mul = Math.max(1, S.items.filter((it) => it.state === 'rest').length / 8);       // 东西很多（小石头）就拿得更快
        const rest = S.items.filter((it) => it.state === 'rest' && !it.queued);   // 连埋着的一起（枯叶堆松动了）
        rest.forEach((it, i) => { it.queued = true; run.queue.push(it); });
      }
      if (!S.items.some((it) => it.state === 'rest' || it.state === 'carry') && !run.queue.length) T.after(0.5, () => T.finish(run));
    } else if (!left.length && !run.queue.length) {
      T.after(0.8, () => T.finish(run));
    }
  }
  /* 点击（舞台坐标）*/
  const toS = (p, ps) => ps || LAB.cam.toScreen(p);
  T.sceneDown = function (p, ps) {
    const run = T.run;
    if (T.mag) return;
    if (run && run.down) run.down(p, toS(p, ps));
  };
  T.sceneMove = function (p, ps) { if (T.run && T.run.move) T.run.move(p, toS(p, ps)); };
  T.sceneUp = function (p, ps) { if (T.run && T.run.up) T.run.up(p, toS(p, ps)); };

  T.tools.hand.down = null;
  const handDown = function (run, p) {
    if (run.moving || run.finished || run.leaking) return;
    const mix = S.mix;
    if (!overBowl(p)) return;
    // 找最上面被点中的东西
    let hit = null;
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      if (it.state !== 'rest' || it.queued) continue;
      if (it.hidden) continue;
      const r = Math.max(56, it.len * 0.46);
      if (Math.hypot(it.x - p.x, (it.y - p.y) * 1.3) < r) { if (run.isPickable(it)) { hit = it; break; } if (!hit) hit = it; }      // 点到重叠的几个：优先拿得起来的
    }
    if (hit) {
      if (!run.isPickable(hit)) { toast(mix.layout === 'pile' ? '这个被压在下面，先拿走上面的' : `埋在${mix.baseName || '沙'}里，手够不到`); return; }
      hit.queued = true; run.queue.push(hit); tip(null);
      return;
    }
    if (run.cur) return;
    if (mix.water) {         // 点到水：水从指缝漏下去，抓不起来（有东西可以捡的混合物，不算结束）
      const noItems = !S.items.some((it) => it.state === 'rest' || it.state === 'carry');
      if (noItems) run.leaking = true;
      tip(null);
      const w = S.bowl.water;
      run.cur = { phase: 'leak', t: 0, dur: 1.2, px: clamp(p.x, BOWL.cx - 220, BOWL.cx + 220), py: w.y + 6, water: true, cols: [], then: noItems ? () => T.after(0.3, () => T.finish(run)) : null };
      return;
    }
    if (mix.base) {      // 点到底料：太细，抓不起来
      const top = LAB.baseTopNow(S.bowl.base);
      const cols = LAB.GRAIN[mix.base] || LAB.GRAIN.sand;
      const noItems = !S.items.some((it) => it.state === 'rest' || it.state === 'carry');
      if (noItems) run.leaking = true;
      run.cur = { phase: 'leak', t: 0, dur: 1.0, px: clamp(p.x, BOWL.cx - 200, BOWL.cx + 200), py: clamp(p.y, top, top + 60), cols, then: noItems ? () => T.after(0.3, () => T.finish(run)) : null };
      toast(`${mix.baseName || '沙'}太细了，从指缝漏下去了`);
    }
  };
  const _hb = T.tools.hand;
  T.tools.hand = function (p) { const run = _hb(p); run.down = (q) => handDown(run, q); return run; };

  /* ───────── 漂浮法 ───────── */
  const WP = { x: BOWL.cx + 225, y: 262, rot: -0.9 };
  const mkWater = (key) => function (p) {            // key＝'water'（漂浮法的水碗）或 'addwater'（连环关：加水搅一搅的玻璃杯）
    const mix = S.mix, id = mix.id;
    const run = { tool: key, phase: 'move', t: 0, spr: { x: p.x, y: p.y, rot: 0, sc: p.sc }, pourT: 0, settleT: 0, floatInit: false, backed: false };
    // 水位：没有水的先建一层
    if (!S.bowl.water) S.bowl.water = { y: BOWL.floorY - 6, home: BOWL.floorY - 6, tint: 'clear', mud: 0, milk: 0, amount: 1, speckA: 0 };
    const w = S.bowl.water; run.y0 = w.y;
    run.yEnd = id === 'sandsalt' ? BOWL.waterTop - 4 : mix.water ? BOWL.waterTop - 12 : BOWL.waterTop;
    const LIP = key === 'water' ? [-0.46, -0.2] : [-0.42, 0.02];      // 倒水口在工具图里的位置（相对图宽／图高）
    const lipOf = (s) => { const im = A['tool_' + key], iw = im.width * (TOOL_H / im.height); const c = Math.cos(s.rot), sn = Math.sin(s.rot), lx = LIP[0] * iw, ly = LIP[1] * TOOL_H; return { x: s.x + lx * c - ly * sn, y: s.y + lx * sn + ly * c }; };
    const stream = (ctx, now) => {
      if (run.phase !== 'pour') return;
      const lip = lipOf(run.spr), tx = lip.x - 6, ty = lerp(run.y0, run.yEnd, easeIO(run.pourT / 2.3)) + 2;
      const head = clamp(run.pourT / 0.25, 0, 1), tail = run.pourT > 2.0 ? (run.pourT - 2.0) / 0.3 : 0;
      const p0 = lip, p1 = { x: lip.x - 20, y: lip.y + 20 }, p2 = { x: tx, y: ty };
      LAB.drawStream(ctx, p0, p1, p2, clamp(tail, 0, 1), head, 15, 'rgba(110,180,235,0.78)', 'rgba(255,255,255,0.7)');
    };
    S.bowlStream = (ctx, now) => {
      if (run.phase !== 'pour') return;
      stream(ctx, now);
    };
    run.update = function (dt) {
      run.t += dt;
      const s = run.spr;
      if (run.phase === 'move') {
        const f = clamp(run.t / 0.5, 0, 1), e = easeIO(f);
        s.x = lerp(p.x, WP.x, e); s.y = lerp(p.y, WP.y, e); s.rot = lerp(0, WP.rot, e); s.sc = lerp(p.sc, 1.05, e);
        if (f >= 1) { run.phase = 'pour'; run.t = 0; }
      } else if (run.phase === 'pour') {
        run.pourT += dt;
        const f = clamp(run.pourT / 2.3, 0, 1);
        w.y = lerp(run.y0, run.yEnd, easeIO(f));
        const lip = lipOf(s);
        if (Math.random() < 0.7) LAB.fx.dot(lip.x - 6 + rand(-24, 24), w.y + 2, rand(-50, 50), rand(-110, -40), { r: rand(1.4, 2.6), c: 'rgba(210,235,255,0.9)', g: 520, decay: 1.6 });
        s.rot = WP.rot - 0.12 * smooth(f);
        if (f > 0.96 && run.pourT >= 2.3) { run.phase = 'settle'; run.t = 0; startReaction(run); }
      } else if (run.phase === 'settle') {
        run.settleT += dt;
        reaction(run, dt);
        if (!run.backed && run.t > 0.4) { run.backed = true; T.sendBack(key, { x: s.x, y: s.y, sc: s.sc, rot: s.rot }); run.hideSpr = true; }
        if (run.t > run.settleDur && !run.finished) T.finish(run);
      }
    };
    run.draw = function (ctx, now) {
      if (!run.hideSpr) {
        const s = run.spr;
        LAB.softShadow(ctx, s.x + 30, 420, 70, 12, 0.12);
        T.drawTool(ctx, key, s.x, s.y, TOOL_H * s.sc, s.rot);
      }
      if (key === 'addwater' && run.phase === 'settle') LAB.drawStir(ctx, run.settleT, S.bowl.water ? S.bowl.water.y : 440);      // 搅一搅：茶匙在碗里转圈
    };
    run.settleDur = 3.0;
    tip(null);
    return run;
  };

  /* 茶匙搅水：茶匙头在水面下转椭圆圈，柄朝右上斜着露在水面上 */
  LAB.drawStir = function (ctx, t, waterY) {
    const im = A.spoon, h = 190, w = im.width * h / im.height, a = t * 7.5, r = 70;
    const tx = BOWL.cx + Math.cos(a) * r, ty = waterY + 64 + Math.sin(a) * r * 0.22;
    const g = ctx.createRadialGradient(tx, waterY + 20, 0, tx, waterY + 20, 100);
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(BOWL.cx, waterY + 24 + i * 14, r + 30 + i * 28, (r + 30 + i * 28) * 0.22, 0, a + i, a + i + 4.2); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.translate(tx, ty); ctx.drawImage(im, -w * 0.12, -h * 0.88, w, h); ctx.restore();       // 匙头在左下，从匙头对准 (tx,ty)
  };
  T.reaction = {};
  function startReaction(run) {
    const mix = S.mix, id = mix.id;
    const leaves = S.items.filter((it) => it.kind === 'leaf' || it.kind === 'twig');      // 会浮的：枯叶、树枝
    if (leaves.length) {
      const xs = shuffle(leaves.map((_, i) => lerp(-0.72, 0.72, leaves.length === 1 ? 0.5 : i / (leaves.length - 1))));
      const ell = BOWL.hwAt(BOWL.waterTop) - 40;
      leaves.forEach((it, i) => {
        it.state = 'float'; it.hidden = false; it.fx0 = it.x; it.fy0 = it.y; it.ft = -i * 0.28 - rand(0, 0.2); it.tx = BOWL.cx + xs[i] * ell; it.ty = BOWL.waterTop + rand(-2, 8) + (i % 2 ? 4 : -2); it.ph = rand(0, TAU); it.alpha = 1; it.fadeIn = 0;
        it.flatRot = rand(-0.3, 0.3);
      });
      run.settleDur = 4.6;
    } else if ((mix.base === 'powder' || mix.base === 'flour') && !mix.water) run.settleDur = 4.2;
    else if (id === 'sandsalt') run.settleDur = 4.2;
    else run.settleDur = 3.4;
  }
  function reaction(run, dt) {
    const mix = S.mix, id = mix.id, w = S.bowl.water, B = S.bowl;
    if (S.items.some((it) => it.state === 'float')) {
      for (const it of S.items) if (it.state === 'float') {
        it.ft += dt / 1.7; const f = clamp(it.ft, 0, 1), e = easeIO(f);
        const wob = Math.sin(run.settleT * 1.6 + it.ph);
        it.x = lerp(it.fx0, it.tx, e) + (f >= 1 ? Math.sin(run.settleT * 0.7 + it.ph) * 7 : Math.sin(f * 9 + it.ph) * 10 * (1 - f));
        it.y = lerp(it.fy0, it.ty, e) + (f >= 1 ? wob * 3 : 0);
        it.rot = lerp(it.restRot, it.flatRot, e) + wob * (f >= 1 ? 0.07 : 0.2 * (1 - f));
        it.squash = lerp(0.9, it.kind === 'twig' ? 0.78 : 0.6, e);
        it.alpha = clamp(it.ft * 3 + 1, 0, 1);
        if (f > 0 && f < 0.9 && Math.random() < 0.3) LAB.fx.dot(it.x + rand(-20, 20), it.y + rand(-6, 14), 0, rand(-40, -20), { r: rand(1.2, 2.2), c: 'rgba(255,255,255,0.85)', g: -20, decay: 1.4 });
      }
    } else if ((mix.base === 'powder' || mix.base === 'flour') && !mix.water) {          // 奶粉溶进水里；面粉散开、把水弄混浊（不是溶解）
      const f = clamp(run.settleT / 3.4, 0, 1), flour = mix.base === 'flour';
      B.base.alpha = lerp(1, flour ? 0.16 : 0.22, easeIO(f)); w.milk = (flour ? 1.3 : 0.55) * easeIO(f);
      if (Math.random() < 0.8) LAB.fx.dot(BOWL.cx + rand(-250, 250), rand(w.y + 20, 560), rand(-12, 12), rand(-16, -4), { r: rand(2, 4), c: flour ? 'rgba(255,255,250,0.55)' : 'rgba(255,252,240,0.5)', g: -4, decay: 0.6 });
    } else if (id === 'sandsalt') {          // 盐粒慢慢消失（溶解），沙沉到碗底，水是清的
      const f = clamp(run.settleT / 3.6, 0, 1), e = easeIO(f);
      B.base.salt = 1 - clamp(f * 1.25, 0, 1); B.base.top = lerp(BOWL.sandTop, 606, easeIO(clamp((f - 0.1) / 0.9, 0, 1))); B.baseDirty = true;
      if (Math.random() < 0.7 && f < 0.9) LAB.fx.dot(BOWL.cx + rand(-250, 250), lerp(BOWL.sandTop, 600, e) + rand(0, 30), rand(-6, 6), rand(-60, -30), { r: rand(1.2, 2.4), c: 'rgba(255,255,255,0.85)', g: -10, decay: 1.1 });
      if (Math.random() < 0.5 && f < 0.85) LAB.fx.dot(BOWL.cx + rand(-250, 250), rand(w.y + 20, 520), rand(-8, 8), rand(20, 70), { r: rand(1.2, 2.2), c: pick(LAB.GRAIN.sand), g: 80, decay: 0.9, floor: 640 });
    } else if (mix.base === 'sand' && !mix.water) {
      if (Math.random() < 0.25) LAB.fx.dot(BOWL.cx + rand(-250, 250), BOWL.sandTop + rand(0, 30), rand(-6, 6), rand(-70, -40), { r: rand(1.5, 3), c: 'rgba(255,255,255,0.75)', g: -10, decay: 0.5 });
    } else if (mix.sandy || mix.water === 'milky') {
      const f = clamp(run.settleT / 3, 0, 1);
      for (const s of B.specks) { s.vx += rand(-1, 1); s.vy += 3 * dt * 60 * 0.1; s.vy = clamp(s.vy, -6, 14); }
      if (f > 0.5) for (const s of B.specks) { s.y = Math.min(s.y + dt * 10, 640); }
    }
  }
  function updateWaterDrift() {}
  T.reaction.start = startReaction; T.reaction.step = reaction;
  T.tools.water = mkWater('water'); T.tools.addwater = mkWater('addwater');

  /* ───────── 磁铁 ───────── */
  function magPoles() {
    const h = T.held, img = A.tool_magnet, s = (TOOL_H * h.sc) / img.height;
    const w = img.width * s, hh = img.height * s;
    const left = h.x - w / 2, top = h.y - hh / 2;
    return [{ x: left + w * 0.15, y: top + hh * 0.97 }, { x: left + w * 0.83, y: top + hh * 0.97 }];
  }
  function startMagnet() {
    const nails = S.items.filter((it) => LAB.IRON[it.kind]);          // 会被吸的（铁钉、回形针、硬币）；变量名沿用 nails
    nails.forEach((it) => { it.sq0 = it.squash; });
    T.mag = { nails, carried: [], dwell: 0, done: false, delivering: false, puffT: 0, tipShown: false };
    T.run = { tool: 'magnet', mag: true };
  }
  LAB.IRON = { nail: 1, clip: 1, coin: 1 };
  const anchorY = (it) => (it.hidden || it.depth === 'side') && S.mix.layout === 'embed' ? Math.min(it.y, BOWL.sandTop + 18) : it.y;
  const baseGrain = () => LAB.GRAIN[S.mix.base] || null;
  function updateMagnet(dt) {
    const M = T.mag, h = T.held;
    if (!M || !h) return;
    const P = magPoles(), mixId = S.mix.id;
    M.puffT -= dt;
    if (h.locked) { /* 递送中，由 deliver 控制 */ }
    for (const it of M.nails) {
      if (it.state === 'rest' && !h.returning && !h.locked) {
        const ay = anchorY(it);
        const d0 = Math.hypot(P[0].x - it.x, P[0].y - ay), d1 = Math.hypot(P[1].x - it.x, P[1].y - ay);
        const pi = d0 < d1 ? 0 : 1, d = Math.min(d0, d1);
        if (d < 230) it.jit = Math.min(1, (it.jit || 0) + dt * 3 * (230 - d) / 120); else it.jit = Math.max(0, (it.jit || 0) - dt * 2);
        const j = it.jit || 0;
        it.jx = j ? Math.sin(performance.now() / 28 + it.x) * 2.2 * j : 0; it.jy = j ? -j * 4 : 0;
        if (it.cov) it.covA = 1 - clamp(j * 1.4, 0, 1);
        if (it.hidden && j > 0.32) { it.hidden = false; it.alpha = 0; }
        if (!it.hidden && it.alpha < 1) it.alpha = Math.min(1, it.alpha + dt * 4);
        if (j > 0.25 && M.puffT <= 0 && baseGrain() && (it.hidden || it.depth !== 'surf')) { LAB.fx.puff(it.x, it.y + 6, 2, 0.5, baseGrain(), it.y + 24); }
        if (d < 165 && j > 0.55) {
          it.state = 'fly'; it.t = 0; it.from = { x: it.x + it.jx, y: it.y + it.jy }; it.alpha = 1; it.hidden = false;
          const k = M.carried.filter((c) => c.pole === pi).length;
          const fan = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.22 + rand(-0.08, 0.08);
          const L = it.len / 2;
          if (it.kind === 'clip') {         // 回形针互相勾着，一串挂在磁铁下面（每个挂在上一个下面，左右略斜）
            it.hangRot = Math.PI / 2 - it.ax.ang + (k % 2 ? 0.16 : -0.16);
            it.off = { pole: pi, dx: Math.sin(k * 1.9) * 5, dy: 10 + L * 0.9 + k * it.len * 0.58 };
          } else {
            it.hangRot = -Math.PI / 2 - it.ax.headAng + fan;
            it.off = { pole: pi, dx: -Math.sin(fan) * L * 0.9 + rand(-5, 5), dy: Math.cos(fan) * L * 0.9 + 6 };
          }
          M.carried.push(it.off);
          if (baseGrain()) LAB.fx.puff(it.x, it.y + 4, 16, 1.2, baseGrain(), it.y + 30);
          it.restRotNow = it.rot;
        }
      } else if (it.state === 'rest') it.jit = Math.max(0, (it.jit || 0) - dt * 2);
      if (it.state === 'fly') {
        it.t += dt / 0.32;
        const pp = P[it.off.pole], tx = pp.x + it.off.dx, ty = pp.y + it.off.dy;
        const e = it.t >= 1 ? 1 : 1 - Math.pow(1 - it.t, 3);
        it.x = it.from.x + (tx - it.from.x) * e; it.y = it.from.y + (ty - it.from.y) * e - Math.sin(Math.min(1, it.t) * Math.PI) * 40;
        it.rot = it.restRotNow + (it.hangRot - it.restRotNow) * e;
        if (it.t > 0.15 && it.t < 0.8 && baseGrain() && Math.random() < 0.5) LAB.fx.dot(it.x, it.y, rand(-30, 30), rand(10, 60), { r: rand(1.4, 2.6), c: pick(baseGrain()), g: 500, decay: 1.4, floor: BOWL.sandTop + 40 });
        if (it.t >= 1) it.state = 'stuck';
      }
      if (it.state === 'stuck') {
        const pp = P[it.off.pole];
        it.x = pp.x + it.off.dx; it.y = pp.y + it.off.dy;
        it.rot = it.hangRot + Math.sin(performance.now() / 380 + it.off.dx) * 0.03;
      }
      if (it.state === 'drop') {
        it.t += dt / 0.4; const e = ease(it.t);
        it.x = lerp(it.from.x, it.home.x, e); it.y = lerp(it.from.y, it.home.y, e) - Math.sin(clamp(it.t, 0, 1) * Math.PI) * 14;
        it.rot += (it.restRot - it.rot) * Math.min(1, dt * 8);
        if (it.t >= 1) { it.state = 'rest'; it.x = it.home.x; it.y = it.home.y; it.rot = it.restRot; it.depth = 'surf'; it.cov = null; it.covA = 0; it.jit = 0; it.jx = it.jy = 0; it.hidden = false; it.alpha = 1; it.squash = it.sq0 || 0.72; LAB.bake(it); LAB.sortItems(); }
      }
    }
    if (!h.locked && !h.returning && !M.done && !M.finishedNoReact) {
      if (M.nails.length) {
        if (M.nails.every((n) => n.state === 'stuck')) {
          M.done = true; T.after(0.5, deliver);
        }
      } else {
        const hover = P.some((q) => (q.x > BOWL.cx - 330 && q.x < BOWL.cx + 330 && q.y > 330 && q.y < 700) || (S.mix.src === 'beaker' && q.x > 1260 && q.y > 330 && q.y < 720));       // 连环关第 3 步：盐水在烧杯里，磁铁也可以悬在烧杯上
        if (hover) { M.dwell += dt; if (M.dwell > 0.9 && !M.tipShown) { M.tipShown = true; } }
        if (M.dwell > 2.4) { M.finishedNoReact = true; T.finish(T.run); }
      }
    }
  }
  function deliver() {
    const M = T.mag, h = T.held; if (!M || !h) return;
    h.locked = true; M.delivering = true;
    const x0 = h.x, y0 = h.y;
    let t = 0;
    const tgt = { x: DISH.cx, y: 430 };
    const step = (dt) => { /* 由 overlay 驱动 */ };
    const ov = (ctx) => {};
    const mover = { t: 0, phase: 0 };
    M.mover = mover; M.x0 = x0; M.y0 = y0; M.tgt = tgt;
    T.deliverUpdate = (dt) => {
      mover.t += dt;
      if (mover.phase === 0) {
        const f = clamp(mover.t / 0.8, 0, 1), e = easeIO(f);
        h.x = lerp(x0, tgt.x, e); h.y = lerp(y0, tgt.y, e) - Math.sin(f * Math.PI) * 50;
        if (f >= 1) {
          mover.phase = 1; mover.t = 0;
          // 钉子依次掉进盘子
          const nails = M.nails.filter((n) => n.state === 'stuck');
          nails.forEach((n, i) => {
            const sl = LAB.dishSlot(S.dish.items.length + i);
            T.after(i * 0.12, () => {
              n.state = 'fall'; n.t = 0; n.from = { x: n.x, y: n.y }; n.fsc = 1; n.fsq = 1; n.dst = sl; n.alpha = 1; n.dstRot = n.elong ? -0.2 - n.ax.ang : rand(-0.5, 0.5);
            });
          });
          M.fallN = nails.length;
        }
      } else if (mover.phase === 1) {
        for (const n of M.nails) if (n.state === 'fall') {
          n.t += dt / 0.5; const e = n.t * n.t;
          n.x = lerp(n.from.x, n.dst.x, clamp(n.t, 0, 1)); n.y = lerp(n.from.y, n.dst.y, clamp(e, 0, 1));
          n.rot += (n.dstRot - n.rot) * Math.min(1, dt * 5); n.fsc = lerp(1, LAB.DISH_SC[n.kind] || 0.62, clamp(n.t, 0, 1)); n.fsq = lerp(1, 0.8, clamp(n.t, 0, 1));
          if (n.t >= 1) { n.state = 'gone'; const d = LAB.dishAdd(n); d.x = n.dst.x; d.y = n.dst.y; LAB.fx.puff(n.dst.x, n.dst.y, 4, 0.4, ['#bdbdbd', '#999'], n.dst.y + 8); }
        }
        if (M.nails.every((n) => n.state === 'gone' || n.state === 'rest') && mover.t > 0.3) {
          mover.phase = 2; mover.t = 0;
          T.finish(T.run);
          T.deliverUpdate = null;
          T.held = null; T.sendBack('magnet', { x: h.x, y: h.y, sc: h.sc });
          T.mag = null;
        }
      }
    };
  }
  // deliver 驱动并入 update：简单挂在 T.update 后
  const _upd = T.update;
  T.update = function (dt) { _upd(dt); if (T.deliverUpdate) T.deliverUpdate(dt); };

  function magnetRelease() {
    const M = T.mag, h = T.held; if (!M || !h) return;
    if (M.delivering) return;
    // 没吸完就放手：吸着的钉子掉回碗里
    for (const it of M.nails) if (it.state === 'stuck' || it.state === 'fly') {
      it.state = 'drop'; it.t = 0; it.from = { x: it.x, y: it.y }; it.home = { x: it.home.x + rand(-6, 6), y: it.home.y };
    }
    T.held = null; T.sendBack('magnet', { x: h.x, y: h.y, sc: h.sc });
    const run = T.run;
    T.mag = null;
    if (run && run.mag && !run.finished) { /* 保留 run，用来在结果出来前不重复判定 */ }
    T.run = run && run.finished ? run : null;
    for (const it of S.items) if (LAB.IRON[it.kind] && it.state === 'rest') { it.jit = 0; it.jx = it.jy = 0; if (it.cov) it.covA = 1; }
    tip(null);
  }
})();
