/* 分离大法实验室 · 引导：聚光暗幕 + 常驻步骤条 + 示范手。
   聚光暗幕：每一步把其他地方压暗，只在这一步要操作／要看的地方挖亮洞；暗幕不拦截点击，暗处照样能点，引导按真实状态直接跳到对应步骤。
   步骤条：1 选混合物 → 2 把工具拖到大碗上 → 3 依工具不同。结果卡出现时暗幕和步骤条都收起，不跟结果卡打架。
   示范手：停在某一步超过约 4 秒没动作（刚进入页面约 1.2 秒）就用食指朝下的手演一次，停一会再重复；一碰画面立刻消失、重新计时。
   示范手是 DOM 元素，pointer-events:none，不拦截点击。漂浮法、滤纸是自动演出，不示范。 */
(function () {
  'use strict';
  const LAB = window.LAB, { W, clamp, lerp, smooth } = LAB, T = LAB.T, ui = LAB.ui, S = LAB.S, cam = LAB.cam;
  const $ = (s) => document.querySelector(s);
  const bar = $('#steps'), demo = $('#demo') || document.createElement('img'), ghost = $('#demoTool') || document.createElement('img');
  demo.id = 'demo'; demo.alt = ''; demo.draggable = false; demo.src = 'assets/tools/hand-point.png';
  ghost.id = 'demoTool'; ghost.alt = ''; ghost.draggable = false;
  $('#stage').append(ghost, demo);

  const STEP3 = {
    hand: '用手：点碗里的东西，把它捡出来',
    water: '看一看：什么浮上来？什么沉下去？',
    magnet: '拿着磁铁，在碗上面慢慢移动',
    sieve: '左右拖动筛子，摇一摇',
    funnel: '看一看：水流下去，什么留在滤纸上？',
    sun: '拖着太阳，沿着虚线走',
    addwater: '看一看：盐怎么了？沙怎么了？',
  };
  const STEP3_NONE = '看一看，会发生什么？';
  const STEP3_SIEVE_LIQ = '看一看：什么漏下去了？';
  const STEP1 = '选一个混合物', STEP2 = '把一个工具拖到大碗上';
  LAB.GUIDE_TEXT = [STEP1, STEP2, STEP3_NONE, STEP3_SIEVE_LIQ].concat(Object.values(STEP3));       // 步骤条的全部句子（语音要预录）
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV = '<svg class="sep" viewBox="0 0 10 16"><path d="M2 2l6 6-6 6" fill="none" stroke="#7a6552" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  bar.innerHTML = [0, 1, 2].map((i) => (i ? CHEV : '') + `<div class="st"><span class="bd"></span><span class="tx"></span></div>`).join('');
  const sts = [...bar.querySelectorAll('.st')];

  let lastTool = null, s2 = false;
  ui.onReset = () => { lastTool = null; s2 = false; };      // 再来一次／换混合物：回到「选好混合物、还没放工具」＝第 2 步
  const toolNow = () => (T.held && T.held.tool) || (T.run && T.run.tool) || null;
  function state() {
    const tool = toolNow(); if (tool) lastTool = tool;
    const h = T.held;
    if ((T.run && !T.run.mag) || (T.mag && h && T.overBowl({ x: h.x, y: h.y + 30 }))) s2 = true;
    const done = ui.resultShown;
    if (tool || s2) ui.chosen = true;           // 直接拿起工具（跳过选混合物）：默认的混合物算选好了
    const cur = done ? 3 : !ui.chosen ? 0 : !s2 ? 1 : 2;       // 0 起算：0＝第 1 步 … 2＝第 3 步，3＝全部做完
    return { cur, done, tool: lastTool };
  }
  let barKey = '';
  LAB.guideReset = () => { barKey = ''; };
  const stepVoiceOn = () => LAB.mode === 'free' || LAB.mode === 'quest' || (LAB.mode === 'predict' && LAB.modes.phase === 'test');
  function renderBar(st) {
    const key = [st.cur, st.done, st.tool, S.mix && S.mix.water].join('|');
    if (key === barKey) return; barKey = key;
    const t3 = st.tool === 'sieve' && S.mix && S.mix.water ? STEP3_SIEVE_LIQ : (STEP3[st.tool] || STEP3_NONE);
    const texts = [STEP1, STEP2, t3];
    if (LAB.voice && !st.done && stepVoiceOn()) LAB.voice.sayNarr(texts[st.cur]);          // 每一步的步骤条句子都有语音
    sts.forEach((el, i) => {
      const isDone = i < st.cur, isNow = i === st.cur;
      el.className = 'st' + (isDone ? ' done' : isNow ? ' now' : '');
      el.querySelector('.bd').innerHTML = isDone ? CHECK : String(i + 1);
      el.querySelector('.tx').textContent = texts[i];
    });
    bar.classList.toggle('hide', st.done);
    bar.classList.toggle('low', st.cur === 2 && st.tool === 'sun');
  }

  /* ── 示范手 ── */
  let idleAt = performance.now(), first = true, stepKey = '', playing = null;
  const poke = () => { idleAt = performance.now(); first = false; hideDemo(); };
  function hideDemo() { playing = null; demo.style.transition = 'none'; demo.style.opacity = '0'; ghost.style.transition = 'none'; ghost.style.opacity = '0'; }
  const stage = $('#stage');
  stage.addEventListener('pointerdown', poke, true);
  stage.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') poke(); }, true);
  addEventListener('keydown', poke);

  const HAND_PX = 150;
  const EASE = smooth;
  const bowlScr = (dx, y) => cam.toScreen({ x: LAB.GEO.BOWL.cx + dx, y });
  /* 每个示范：返回 {dur, at(u)→{x,y,a}}，(x,y) 是指尖在舞台里的位置，a 是透明度 0..1 */
  function plan(st) {
    if (LAB.chain.active || LAB.mode === 'home' || LAB.mode === 'qmap' || (LAB.mode === 'predict' && LAB.modes.phase !== 'test' && LAB.modes.phase !== 'pick')) return null;
    const tool = st.tool, B = LAB.GEO.BOWL;
    if (!st.done && st.cur === 0 && !T.held && !T.run && !T.mag) {      // 第 1 步：点一张混合物卡
      const tg = ui.mixPos(1);
      return { dur: 3.0, at(u) {
        const down = EASE(clamp(u / 0.55, 0, 1)), tap = u > 0.7 ? Math.max(0, Math.sin((u - 0.7) * 6.5)) * 14 : 0;
        return { x: tg.x, y: tg.y - (1 - down) * 110 - tap, a: clamp(u / 0.3, 0, 1) * clamp((3.0 - u) / 0.4, 0, 1) };
      } };
    }
    if (!st.done && st.cur === 1 && !T.held && !T.run && !T.mag) {      // 第 2 步：从工具卡拖到大碗上（选右边的卡，路线不经过步骤条的字）
      const c = T.cardPos('sun'), a = { x: c.x, y: c.y + 6 }, b = { x: B.cx - 20, y: 520 };
      return { dur: 3.4, ghost: 'sun', at(u) {
        const k = EASE(clamp((u - 0.7) / 1.5, 0, 1));
        const bob = u < 0.7 ? Math.sin(clamp(u / 0.7, 0, 1) * Math.PI) * 8 : 0;
        return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) + bob, a: clamp(u / 0.35, 0, 1) * clamp((3.4 - u) / 0.4, 0, 1) };
      } };
    }
    if (st.done || st.cur !== 2 || !T.run) return null;
    const run = T.run;
    if (tool === 'hand' && !run.moving && !run.cur && !run.queue.length && !run.finished) {
      const it = S.items.find((q) => run.isPickable(q));
      let tg;
      if (it) tg = cam.toScreen({ x: it.x, y: it.y + 6 });
      else tg = S.mix.water ? bowlScr(0, B.waterTop + 24) : bowlScr(0, B.sandTop + 10);
      return { dur: 3.0, at(u) {
        const down = EASE(clamp(u / 0.55, 0, 1)), tap = u > 0.7 ? Math.max(0, Math.sin((u - 0.7) * 6.5)) * 16 : 0;      // 落下、再点两下
        return { x: tg.x, y: tg.y - (1 - down) * 120 - tap, a: clamp(u / 0.3, 0, 1) * clamp((3.0 - u) / 0.4, 0, 1) };
      } };
    }
    if (tool === 'magnet' && T.mag && T.held && !T.mag.delivering) {
      const c = bowlScr(0, 420);
      return { dur: 3.6, at(u) { return { x: c.x + Math.sin(u * 3.4) * 190, y: c.y + Math.sin(u * 6.8) * 14, a: clamp(u / 0.35, 0, 1) * clamp((3.6 - u) / 0.4, 0, 1) }; } };
    }
    if (tool === 'sieve' && run.phase === 'shake' && !run.drag && !run.finished && !S.mix.water) {
      const c = cam.toScreen({ x: LAB.SIEVE_POS.x, y: LAB.SIEVE_POS.y + 6 });
      return { dur: 3.0, at(u) { return { x: c.x + Math.sin(u * 5.2) * 80, y: c.y, a: clamp(u / 0.35, 0, 1) * clamp((3.0 - u) / 0.4, 0, 1) }; } };
    }
    if (tool === 'sun' && run.phase === 'sun' && run.prog < 0.05 && !run.drag && !run.finished) {
      return { dur: 3.8, at(u) {
        const k = EASE(clamp((u - 0.5) / 2.8, 0, 1)) * 0.92, p = run.pos(k);
        return { x: p.x, y: p.y + 30, a: clamp(u / 0.35, 0, 1) * clamp((3.8 - u) / 0.4, 0, 1) };
      } };
    }
    return null;
  }

  function place(p, pl) {
    const tp = LAB.TIP && LAB.TIP.point ? LAB.TIP.point : { x: 0.37, y: 1 };
    const w = HAND_PX * (217 / 320);
    demo.style.height = HAND_PX + 'px';
    demo.style.transform = `translate(${p.x - tp.x * w}px, ${p.y - HAND_PX}px)`;
    demo.style.opacity = String(0.74 * p.a);
    if (pl.ghost) {
      ghost.src = `assets/tools/tool-${pl.ghost}.png`; ghost.style.height = '96px';
      ghost.style.transform = `translate(${p.x - 40}px, ${p.y - 92}px)`; ghost.style.opacity = String(0.8 * p.a);
    } else ghost.style.opacity = '0';
  }


  /* ── 聚光暗幕 ── */
  const dimCv = $('#dim'), dctx = dimCv.getContext('2d');
  const DIM_A = 0.6;
  let dimA = 0, dimTarget = 0, holes = [], lastT = performance.now();
  const rr = (c, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  };
  const wr = (x0, y0, x1, y1, r, pad) => {            // 世界座标的矩形 → 舞台座标（跟着镜头走）
    const a = cam.toScreen({ x: x0, y: y0 }), b = cam.toScreen({ x: x1, y: y1 }), p = pad == null ? 12 : pad;
    return { x: a.x - p, y: a.y - p, w: b.x - a.x + 2 * p, h: b.y - a.y + 2 * p, r: r || 40 };
  };
  let spotDone = false;       // 暗幕只在每次打开页面后的第一轮出现：第一张结果卡出来后就结束，不存 localStorage，重新整理才会再有
  function holesFor(st) {
    if (LAB.mode !== 'free') return [];          // 聚光暗幕只在「自由实验」的第一轮出现
    if (st.done) spotDone = true;
    if (spotDone) return [];
    if (st.cur === 0) return [{ x: 32, y: 736, w: 1536, h: 136, r: 34 }];                                           // 第 1 步：混合物卡一排（含翻页箭头）
    const bowl = wr(495, 325, 1245, 752, 46, 6), dish = wr(55, 555, 535, 676, 44, 6);
    if (st.cur === 1) return [{ x: 168, y: 16, w: 1280, h: 200, r: 40 }, bowl];                                      // 第 2 步：工具栏＋大碗
    switch (st.tool) {                                                                                               // 第 3 步：这个工具要操作／要看的地方
      case 'hand': return [bowl, dish];
      case 'water': return [wr(470, 200, 1300, 752, 46, 6)];
      case 'magnet': return [wr(470, 250, 1275, 752, 46, 6)];
      case 'sieve': return [wr(75, 335, 515, 668, 46, 6)];
      case 'funnel': return [wr(1275, 215, 1610, 748, 46, 6)];
      case 'sun': return [{ x: 90, y: 190, w: 1420, h: 270, r: 60 }, wr(55, 380, 545, 690, 44, 6)];                 // 太阳＋虚线弧、浅盘（倒出来的路也亮着）
      default: return [bowl];
    }
  }
  function drawDim(now, dt, st) {
    const tg = holesFor(st);
    dimTarget = tg.length ? 1 : 0;
    dimA += (dimTarget - dimA) * Math.min(1, dt / 0.12 * 0.4);      // 约 0.3 秒淡入淡出
    tg.forEach((t, i) => { if (!holes[i]) holes[i] = Object.assign({}, t, { ha: 0 }); });
    const k = Math.min(1, dt * 7);
    holes.forEach((h, i) => {
      const t = tg[i];
      if (t) { for (const key of ['x', 'y', 'w', 'h', 'r']) h[key] += (t[key] - h[key]) * k; h.ha += (1 - h.ha) * Math.min(1, dt * 8); }      // 洞的位置用缓动移过去
      else h.ha += (0 - h.ha) * Math.min(1, dt * 8);
    });
    holes = holes.filter((h, i) => tg[i] || h.ha > 0.02);
    dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, 900);
    if (dimA < 0.01) return;
    dctx.fillStyle = `rgba(14,10,20,${DIM_A * dimA})`; dctx.fillRect(0, 0, W, 900);
    dctx.globalCompositeOperation = 'destination-out';
    for (const h of holes) {
      for (let i = 10; i >= 1; i--) { dctx.fillStyle = `rgba(0,0,0,${0.17 * h.ha})`; rr(dctx, h.x - i * 3, h.y - i * 3, h.w + i * 6, h.h + i * 6, h.r + i * 3); dctx.fill(); }      // 边缘羽化
      dctx.fillStyle = `rgba(0,0,0,${h.ha})`; rr(dctx, h.x, h.y, h.w, h.h, h.r); dctx.fill();
    }
    dctx.globalCompositeOperation = 'source-over';
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);          // 亮洞外缘一圈柔光，慢慢脉动
    for (const h of holes) {
      for (const [w, a] of [[16, 0.07], [9, 0.12], [4, 0.2]]) { dctx.strokeStyle = `rgba(255,236,160,${a * (0.5 + pulse * 0.9) * h.ha * dimA})`; dctx.lineWidth = w; rr(dctx, h.x - 2, h.y - 2, h.w + 4, h.h + 4, h.r + 2); dctx.stroke(); }
    }
  }

  const REST = 1.8;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const st = state(); renderBar(st);
    drawDim(now, dt, st);
    const key = [st.cur, st.done, st.tool].join('|');
    if (key !== stepKey) { stepKey = key; idleAt = now; hideDemo(); }
    if (LAB.paused || st.done) { hideDemo(); return; }
    const need = first ? 1200 : 4000;
    if (!playing) {
      if (now - idleAt < need) return;
      const pl = plan(st); if (!pl) return;
      playing = { pl, t0: now, cycle: pl.dur + REST };
    }
    const age = (now - playing.t0) / 1000, u = age % playing.cycle;
    const pl = plan(st);
    if (!pl) { hideDemo(); idleAt = now; return; }
    if (u > pl.dur) { demo.style.opacity = '0'; ghost.style.opacity = '0'; return; }
    place(pl.at(u), pl);
  }
  window.__debug = window.__debug || {};
  window.__debug.guide = { state, spotDone: () => spotDone, holes: () => holes.map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), w: Math.round(h.w), h: Math.round(h.h) })), dimA: () => dimA, demoOn: () => !!playing && +demo.style.opacity > 0.05 };
  requestAnimationFrame(tick);
})();
