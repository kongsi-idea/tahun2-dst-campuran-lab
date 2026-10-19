/* 分离大法实验室 · 连环分离（SPEC 第 13 节）：沙和盐（3 步）、大挑战「两杯找盐」。
   做法：
   · 沙和盐把中间状态当成「虚拟混合物」：S0＝干的沙和盐（LAB.MIXES.sandsalt）、S1＝加水后（VMIX.sandsalt1，沙沉在碗底、盐溶解、水是清的）、
     S2＝沙留在滤纸上、盐水在烧杯里（VMIX.sandsalt2，滤纸停在画面上当「固定装置」）。S1 用错工具，直接走第 1 检查点的真实演出（沙和水一样的画面），
     原因句换成 TRUTH.sandsalt1；S2 用错工具走一小段示意演出（demo）。「再试一次」＝回到这一步开始时的状态。
   · 两杯找盐：大碗换成 A、B 两个玻璃杯（背景用 bg-cups.jpg＝bg.jpg 把大碗和影子抹掉；assets 里有生成脚本说明在 handoff.md）。
     工具拖到哪一杯就作用在那一杯，各杯有自己的状态（有没有滤过、有没有晒过）；浅盘分 A、B 两块水渍。 */
(function () {
  'use strict';
  const LAB = window.LAB, { W, H, GEO, S, A, rand, clamp, lerp, smooth, pick } = LAB;
  const { BOWL, DISH, BEAK } = GEO;
  const T = LAB.T, ui = LAB.ui, TAU = Math.PI * 2, easeIO = smooth;
  const $ = (s) => document.querySelector(s);
  const TOOL_H = 150;
  const C = LAB.chain = { active: false, kind: null, stage: 0, misses: 0, wrongAnswers: 0, quest: false, done: false, onComplete: null, cupAsk: false };
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW = '<svg class="arr" viewBox="0 0 10 16"><path d="M2 2l6 6-6 6" fill="none" stroke="#7a6552" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const voice = {
    narr: (t) => { if (LAB.voice) LAB.voice.sayNarr(t); },
    list: (a) => { if (LAB.voice) LAB.voice.sayList(a); },
  };

  /* ───────── 进度条、提示 ───────── */
  const bar = $('#chainbar'), barRow = bar.querySelector('.cb-row'), barHint = bar.querySelector('.cb-hint');
  C.setHint = (t, speak) => { barHint.textContent = t || ''; if (t && speak) voice.narr(t); };
  C.renderBar = () => {
    if (C.kind === 'sandsalt') {
      const n = LAB.CHAIN.sandsalt.steps;
      barRow.innerHTML = Array.from({ length: n }, (_, i) => {
        const done = C.stage > i, now = C.stage === i;
        return (i ? ARROW : '') + `<div class="cs ${done ? 'done' : now ? 'now' : ''}"><span class="bd">${done ? CHECK : i + 1}</span><span class="tx">第 ${i + 1} 步${now ? ' …' : ''}</span></div>`;
      }).join('');
    } else if (C.kind === 'cups' && S.cups) {
      barRow.innerHTML = ['A', 'B'].map((id, i) => {
        const c = S.cups[id], done = c.evap, now = !done;
        return (i ? ARROW : '') + `<div class="cs ${done ? 'done' : now ? 'now' : ''}"><span class="bd">${done ? CHECK : id}</span><span class="tx">${id} 杯${done ? ' 晒完了' : c.filtered ? ' 滤过了' : ''}</span></div>`;
      }).join('');
    }
  };

  /* ───────── 开始／结束 ───────── */
  C.start = (kind, opts) => {
    opts = opts || {};
    Object.assign(C, { active: true, kind, stage: 0, misses: 0, wrongAnswers: 0, done: false, cupAsk: false, quest: !!opts.quest, onComplete: opts.onComplete || null, pendingRestore: null });
    $('#cupask').classList.remove('on');
    if (kind === 'sandsalt') {
      ui.setTools(LAB.TOOLS.concat([LAB.TOOL_ADD]));
      ui.mixId = 'sandsalt'; ui.chosen = true; ui.resetMix();
      C.setHint(LAB.CHAIN.sandsalt.hints[0]); if (LAB.voice) LAB.voice.say([{ v: 'Z', t: LAB.CHAIN.sandsalt.intro }, { v: 'X', t: LAB.CHAIN.sandsalt.hints[0] }]);
    } else {
      ui.setTools(LAB.TOOLS.slice());         // 两杯找盐不用「加水搅一搅」：规格没有定义它对水和面粉的反应
      ui.mixId = 'cups'; ui.chosen = true; ui.resetMix();
      initCups();
      C.setHint(LAB.CHAIN.cups.hints[0]); if (LAB.voice) LAB.voice.say([{ v: 'Z', t: LAB.CHAIN.cups.intro }, { v: 'X', t: LAB.CHAIN.cups.hints[0] }]);
    }
    C.renderBar();
  };
  C.stop = () => {
    C.active = false; C.kind = null; C.cupAsk = false; S.cups = null; S.fixtures = [];
    $('#cupask').classList.remove('on');
    ui.setTools(LAB.TOOLS.slice());
  };
  C.stars = () => {
    if (C.kind === 'cups') return C.wrongAnswers === 0 && C.misses === 0 ? 3 : (C.wrongAnswers === 0 || C.misses === 0) ? 2 : 1;
    return C.misses === 0 ? 3 : C.misses <= 2 ? 2 : 1;
  };
  C.retry = () => {
    ui.hideResult(); T.reset();
    if (C.kind === 'sandsalt') C.loadStage(C.stage); else cupsRestore();
    if (ui.onReset) ui.onReset();
  };

  /* ───────── 沙和盐：各步骤的场景 ───────── */
  C.loadStage = (n) => {
    if (n === 0) { ui.resetMix(); return; }
    T.reset(); ui.resultShown = false;
    if (n === 1) { LAB.resetMix('sandsalt1'); S.fixtures = []; }
    else softS2();
    if (ui.onReset) ui.onReset();
  };
  function softS2() {
    S.mix = LAB.VMIX.sandsalt2; S.fx = []; S.glow = null; S.sunLight = 0; S.items = [];
    S.dish = { items: [], fine: null, liquid: null, salt: 0, glintT: 0, puddles: null };
    S.beaker = { lv: 0.6, salty: true };
    S.bowl.base = null; S.bowl.water = null; S.bowl.specks = []; S.bowl.baseDirty = true;
    if (C.funnelRun) S.fixtures = [fixtureFunnel(C.funnelRun)];
  }
  /* 滤纸固定装置：沙留在滤纸上，滤纸（漏斗）停在烧杯上面。被拿起来用的时候先收起。 */
  function fixtureFunnel(run) {
    return (ctx, t) => {
      const used = (T.held && T.held.tool === 'funnel') || (T.run && T.run !== run && T.run.tool === 'funnel' && C.stage === 2);
      if (!used) run.draw(ctx, t);
    };
  }
  LAB.funnelGlow = (ctx) => {
    const r = C.funnelRun; if (!r) return;
    const im = A.tool_funnel, h = 215, w = im.width * h / im.height, s = r.spr;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(s.x - w / 2 - 10, s.y - h / 2 - 8, w + 20, h + 16, 26) : ctx.rect(s.x - w / 2 - 10, s.y - h / 2 - 8, w + 20, h + 16); ctx.stroke();
  };

  function advance(n, run) {
    const cs = LAB.CHAIN.sandsalt;
    C.stage = n; C.renderBar();
    if (n === 1) { S.mix = LAB.VMIX.sandsalt1; run.phase = 'end'; }
    if (n === 2) {
      S.mix = LAB.VMIX.sandsalt2; S.items = []; S.bowl.base = null; S.bowl.water = null; S.bowl.specks = []; S.bowl.baseDirty = true;
      run.fixture = true; C.funnelRun = run; S.fixtures = [fixtureFunnel(run)];
      ui.setCardAway('funnel', false);
      T.after(1.6, () => LAB.cam.reset());
    }
    C.setHint(cs.stepDone[n - 1]);          // 提示放在进度条下面（不用吐司：吐司会压在烧杯水面上）
    setTimeout(() => { if (C.stage === n && !C.done) C.setHint(cs.hints[n]); }, 3200);
    voice.list([cs.stepDone[n - 1], cs.hints[n]]);
  }
  function complete() {
    const cs = LAB.CHAIN[C.kind === 'cups' ? 'cups' : 'sandsalt'];
    C.done = true; C.stage = 3; C.renderBar(); C.setHint('');
    ui.setCardAway('sun', false);
    if (C.kind !== 'cups') LAB.glow(['dish', 'funnel'], LAB.clock);          // 沙在滤纸上、盐在浅盘里：两个都发光
    const quest = C.quest;
    ui.showResult(C.kind === 'cups' ? 'cups' : 'sandsalt', 'sun', {
      truth: ['ok', cs.summary], title: cs.doneTitle, prop: false, extra: null,
      again: quest ? { label: LAB.PHRASE.next, fn: () => C.onComplete && C.onComplete({ stars: C.stars() }) } : { label: LAB.PHRASE.again, fn: () => C.start(C.kind, { quest: false }) },
    });
  }

  /* ───────── 示意演出：用错工具、没有对应真实流程时，工具飞过去做一小段、什么都没发生，再出 ❌ ───────── */
  /* tgt：{x（工具悬停的 x）, hover（工具悬停的 y）, surf（液面 y）}；p：放开工具时的 {x,y,sc} */
  function demo(tool, p, tgt, o) {
    o = o || {};
    const run = { tool, t: 0, phase: 'go', spr: { x: p.x, y: p.y, sc: p.sc, rot: 0 }, hideSpr: false, pose: 'open', o };
    const hand = tool === 'hand';
    const act = { hand: 2.4, water: 2.2, addwater: 2.2, sieve: 2.2, funnel: 2.2 }[tool] || 2;
    const start = hand ? { x: p.x, y: p.y + 140 } : { x: p.x, y: p.y };
    run.spr.x = start.x; run.spr.y = start.y;
    const aim = (tool === 'water' || tool === 'addwater') ? { x: tgt.x + 120, y: tgt.hover - 50, rot: -0.9 } : { x: tgt.x, y: tgt.hover, rot: 0 };
    run.update = (dt) => {
      run.t += dt; const s = run.spr;
      if (run.phase === 'go') {
        const f = clamp(run.t / 0.6, 0, 1), e = easeIO(f);
        s.x = lerp(start.x, aim.x, e); s.y = lerp(start.y, hand ? tgt.hover - 30 : aim.y, e) - Math.sin(f * Math.PI) * 24; s.rot = lerp(0, aim.rot, e);
        if (!hand) s.sc = lerp(p.sc, tool === 'sieve' ? 1.35 : 1.1, e);
        if (f >= 1) { run.phase = 'act'; run.t = 0; }
      } else if (run.phase === 'act') {
        const u = clamp(run.t / act, 0, 1);
        if (hand) {            // 手伸进水里抓一把，抬起来，水从指缝漏掉
          const dip = Math.sin(clamp((u - 0.1) / 0.7, 0, 1) * Math.PI);
          s.y = lerp(tgt.hover - 30, tgt.surf + 10, dip); run.pose = u > 0.38 && u < 0.72 ? 'grab' : 'open';
          if (u > 0.62 && u < 0.9 && Math.random() < 0.5) LAB.fx.drop(s.x + rand(-14, 14), s.y + 6, { vy: 20, floorY: tgt.surf + 24 });
        } else if (tool === 'sieve' || tool === 'funnel') {
          s.x = aim.x + (tool === 'sieve' ? Math.sin(run.t * 17) * 16 : 0);
          if (Math.random() < 0.55 && u < 0.9) LAB.fx.drop(s.x + rand(-26, 26), s.y + 52, { vy: 40, floorY: tgt.surf, c: 'rgba(135,195,240,0.95)' });
        } else if (tool === 'water' || tool === 'addwater') {
          s.rot = aim.rot - 0.1 * Math.sin(u * Math.PI);
        }
        if (run.t >= act) { run.phase = 'back'; run.t = 0; if (!hand) { T.sendBack(tool, { x: s.x, y: s.y, sc: s.sc, rot: s.rot }); run.hideSpr = true; } }
      } else if (run.phase === 'back') {
        if (run.t > 0.35 && !run.finished) T.finish(run);
      }
    };
    run.draw = (ctx) => {
      if (hand || run.hideSpr) return;
      const s = run.spr;
      if ((tool === 'water' || tool === 'addwater') && run.phase === 'act') {      // 倒水：一条水流从杯口落进液面
        const u = clamp(run.t / act, 0, 1), head = clamp(run.t / 0.25, 0, 1), tail = u > 0.85 ? (u - 0.85) / 0.15 : 0;
        const p0 = { x: s.x - 62, y: s.y + 36 }, p2 = { x: tgt.x - 4, y: tgt.surf };
        LAB.drawStream(ctx, p0, { x: p0.x - 10, y: p0.y + 30 }, p2, clamp(tail, 0, 1), head, 13, 'rgba(110,180,235,0.78)', 'rgba(255,255,255,0.7)');
      }
      LAB.softShadow(ctx, s.x + 30, tgt.surf + 90, 70, 12, 0.12);
      T.drawTool(ctx, tool, s.x, s.y, TOOL_H * s.sc, s.rot);
    };
    run.drawScreen = (ctx) => { if (hand) LAB.drawHand(ctx, run.pose, run.spr.x, run.spr.y, 140); };
    return run;
  }
  const beakerSurf = () => lerp(BEAK.inBottom - 6, BEAK.rimY + 38, S.beaker.lv);
  const bowlTgt = () => ({ x: BOWL.cx, hover: 300, surf: BOWL.waterTop - 4 });
  const beakTgt = () => ({ x: BEAK.cx - 20, hover: 330, surf: beakerSurf() });

  /* ───────── 两杯找盐 ───────── */
  const CUP = { w: 217, h: 300, bottom: 706, xs: { A: 745, B: 985 } };        // 杯子图（301×417）按 300 高画；底边落在桌面 y≈706
  CUP.k = CUP.h / 417; CUP.top = CUP.bottom - 410 * CUP.k;                     // 杯子图顶边的舞台 y（图里杯底外缘在 y≈410，落在桌面）
  const cupLeft = (id) => CUP.xs[id] - 301 * CUP.k / 2;
  const cupSurfY = (c) => CUP.top + lerp(326, 70, c.lv) * CUP.k;      // 液面（舞台 y）
  const mkCup = () => ({ lv: 1, milk: 1, filtered: false, evap: false });
  function initCups() {
    S.cups = { salty: Math.random() < 0.5 ? 'A' : 'B', A: mkCup(), B: mkCup() };
    S.dish.puddles = [{ label: 'A', dx: -100, lv: 0, milk: 0, flour: 0, salt: 0 }, { label: 'B', dx: 100, lv: 0, milk: 0, flour: 0, salt: 0 }];
    C.snap = null;
  }
  LAB.cupsDraw = function (ctx, t) {
    if (!S.cups || S.cups.hide) return;
    for (const id of ['A', 'B']) drawCup(ctx, id, S.cups[id], t);
  };
  /* 杯里的混浊液体：先画液体（裁在杯子内壁形状里），再把玻璃杯图盖上去，高光才压在液体上面 */
  const SPECKS = []; (() => { let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 70; i++) SPECKS.push({ x: 40 + r() * 220, y: 60 + r() * 260, r: 1.2 + r() * 2.2, ph: r() * 6 }); })();
  function drawCup(ctx, id, c, t) {
    const k = CUP.k, left = cupLeft(id), top = CUP.top, img = A.tool_cup;
    LAB.softShadow(ctx, CUP.xs[id] + 18, CUP.bottom + 4, 128, 15, 0.3);
    if (c.lv > 0.01) {
      ctx.save(); ctx.translate(left, top); ctx.scale(k, k);
      const clip = new Path2D(); clip.moveTo(27, 44); clip.lineTo(275, 44); clip.lineTo(253, 322); clip.quadraticCurveTo(150, 350, 48, 322); clip.closePath(); ctx.clip(clip);
      const ys = lerp(326, 70, c.lv), m = clamp(c.milk, 0, 1);
      const g = ctx.createLinearGradient(0, ys, 0, 340);
      const mix = (a, b) => `rgba(${(a[0] + (b[0] - a[0]) * m) | 0},${(a[1] + (b[1] - a[1]) * m) | 0},${(a[2] + (b[2] - a[2]) * m) | 0},${(a[3] + (b[3] - a[3]) * m).toFixed(3)})`;
      g.addColorStop(0, mix([170, 215, 244, 0.42], [250, 248, 240, 0.95])); g.addColorStop(1, mix([100, 165, 214, 0.6], [226, 221, 208, 0.96]));
      ctx.fillStyle = g; ctx.fillRect(0, ys, 301, 417 - ys);
      const hw = lerp(124, 104, (ys - 44) / 280), cx = 150.5;
      ctx.beginPath(); ctx.ellipse(cx, ys, hw, hw * 0.1, 0, 0, TAU);
      ctx.fillStyle = m > 0.4 ? 'rgba(255,255,250,0.55)' : 'rgba(225,244,255,0.5)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, ys, hw, hw * 0.1, 0, 0.05, Math.PI - 0.05); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.stroke();
      if (m > 0.25) for (const s of SPECKS) {       // 面粉小颗粒在水里慢慢飘
        const yy = ys + 16 + ((s.y - 60 + Math.sin(t / 900 + s.ph) * 6) % 250 + 250) % 250 * (326 - ys - 20) / 250;
        ctx.fillStyle = `rgba(255,255,252,${0.55 * m})`; ctx.beginPath(); ctx.arc(s.x + Math.sin(t / 1300 + s.ph) * 4, yy, s.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.drawImage(img, left, top, 301 * k, 417 * k);
    // 杯名牌：玻璃杯正面贴一个圆形贴纸
    const bx = CUP.xs[id], by = CUP.top + 232 * k;
    ctx.save(); ctx.shadowColor = 'rgba(80,45,10,0.35)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
    const bg = ctx.createRadialGradient(bx - 12, by - 14, 4, bx, by, 38); bg.addColorStop(0, '#ffd27a'); bg.addColorStop(1, '#e7860a');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 38, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '900 46px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(id, bx, by + 2);
    const chip = c.evap ? '晒完了' : c.filtered ? '已滤过' : '';
    if (chip) {
      ctx.font = '900 26px "Noto Sans SC", sans-serif'; const w = ctx.measureText(chip).width + 30, cy = CUP.top - 18;
      ctx.fillStyle = c.evap ? 'rgba(46,158,69,0.95)' : 'rgba(63,143,224,0.95)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - w / 2, cy - 21, w, 42, 21) : ctx.rect(bx - w / 2, cy - 21, w, 42); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(chip, bx, cy + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }
  LAB.cupGlow = (ctx, id) => { const k = CUP.k; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cupLeft(id) - 8, CUP.top - 8, 301 * k + 16, 417 * k + 8, 26) : ctx.rect(cupLeft(id) - 8, CUP.top - 8, 301 * k + 16, 417 * k + 8); ctx.stroke(); };
  const cupAt = (p) => {
    let best = null, bd = 1e9;
    for (const id of ['A', 'B']) { const d = Math.abs(p.x - CUP.xs[id]); if (d < 150 && p.y > 320 && p.y < 760 && d < bd) { best = id; bd = d; } }
    return best;
  };
  const cupTgt = (id) => ({ x: CUP.xs[id], hover: 330, surf: cupSurfY(S.cups[id]) });
  const takeSnap = () => JSON.parse(JSON.stringify({ A: S.cups.A, B: S.cups.B, pud: S.dish.puddles }));
  function cupsRestore() {
    const sn = C.pendingRestore; C.pendingRestore = null;
    if (!sn || !S.cups) return;
    Object.assign(S.cups.A, sn.A); Object.assign(S.cups.B, sn.B);
    S.dish.puddles.forEach((p, i) => Object.assign(p, sn.pud[i]));
    S.dish.fine = null; S.dish.liquid = null; S.sunLight = 0; C.renderBar();
  }

  /* 滤纸：漏斗停在杯子上方，杯里混浊的液体慢慢变清，面粉留在滤纸上 */
  function cupFunnel(p, id) {
    const c = S.cups[id], m = LAB.measureFunnel(), FN = 190, w = A.tool_funnel.width * FN / A.tool_funnel.height;
    if (c.filtered) { const r = demo('funnel', p, cupTgt(id), { again: true }); r.again = true; return r; }
    const tipDx = (m.tipX - 0.5) * w, tipDy = (m.tipY - 0.5) * FN;
    const fx = CUP.xs[id] - tipDx, fy = CUP.top + 40 - tipDy;                       // 漏斗尖端落在杯口里
    const run = { tool: 'funnel', cup: id, phase: 'move', t: 0, spr: { x: p.x, y: p.y, sc: p.sc }, dripT: 0, paste: 0, snap: takeSnap() };
    const tip = { x: CUP.xs[id], y: CUP.top + 44 };
    run.update = (dt) => {
      run.t += dt; const s = run.spr;
      if (run.phase === 'move') {
        const f = clamp(run.t / 0.7, 0, 1), e = easeIO(f);
        s.x = lerp(p.x, fx, e); s.y = lerp(p.y, fy, e) - Math.sin(f * Math.PI) * 40; s.sc = lerp(p.sc, FN / TOOL_H, e);
        if (f >= 1) { run.phase = 'filter'; run.t = 0; }
      } else if (run.phase === 'filter') {
        const f = clamp(run.t / 3.2, 0, 1);
        c.milk = 1 - easeIO(f); run.paste = easeIO(f);
        run.dripT -= dt;
        if (run.dripT <= 0 && f < 0.97) { run.dripT = 0.08; LAB.fx.drop(tip.x + rand(-2, 2), tip.y + 2, { vy: 60, floorY: cupSurfY(c), c: 'rgba(150,205,240,0.95)' }); }
        if (f >= 1) { run.phase = 'back'; run.t = 0; c.filtered = true; c.milk = 0; C.renderBar(); T.sendBack('funnel', { x: s.x, y: s.y, sc: s.sc }); run.hideSpr = true; }
      } else if (run.phase === 'back') { if (run.t > 0.5 && !run.finished) T.finish(run); }
    };
    run.draw = (ctx) => {
      if (run.hideSpr) return;
      const s = run.spr;
      T.drawTool(ctx, 'funnel', s.x, s.y, TOOL_H * s.sc, 0);
      if (run.paste > 0.02 && run.phase !== 'move') LAB.drawWetPaste(ctx, s.x + (m.mouthX - 0.5) * w * (s.sc * TOOL_H / FN), s.y + (m.mouthY - 0.5) * FN * (s.sc * TOOL_H / FN) + 24, w * 0.26, run.paste, 'flour');
    };
    return run;
  }

  /* 蒸发：这杯倒进浅盘（A 杯倒左边那块、B 杯倒右边那块），再拖太阳。没滤过的留下面粉；滤过的，有盐那杯留下盐粒。 */
  function cupSun(p, id) {
    const c = S.cups[id], P = S.dish.puddles.find((q) => q.label === id), salty = S.cups.salty === id;
    const snap = takeSnap(), lv0 = c.lv, milk0 = c.milk, filtered = c.filtered;
    S.sunHook = {
      cam: [1.25, 600, 520],
      makePour: () => LAB.makePour({
        side: 'l', dur: 2.0, src: 'cup', p0: { x: CUP.xs[id] - 86, y: CUP.top + 18 }, dest: { x: DISH.cx + P.dx + 10, y: DISH.floorCy - 10 },
        liquid: filtered ? 'water' : 'milky', grains: null, itemTarget: () => ({ x: 0, y: 0, sc: 1, rot: 0 }), onItem: () => {},
        onProgress: (f) => { c.lv = lv0 * (1 - easeIO(f)); P.lv = easeIO(clamp((f - 0.1) / 0.9, 0, 1)); P.milk = milk0; },
      }),
      sunTick: (pr, run, dt) => {
        const ev = easeIO(clamp(pr / 0.82, 0, 1));
        P.lv = 1 - ev;
        if (!filtered) P.flour = ev;                                      // 没滤过：晒干后留下一层面粉
        else if (salty) P.salt = smooth(clamp((pr - 0.28) / 0.66, 0, 1));    // 滤过的有盐那杯：留下白色盐粒；没盐的什么都不留
        run.steamT = (run.steamT || 0) - dt;
        if (pr > 0.02 && ev < 0.97 && run.steamT <= 0) { run.steamT = 0.08; LAB.fx.steam(DISH.cx + P.dx + rand(-1, 1) * 60 * Math.sqrt(1 - ev), DISH.floorCy - 10); }
      },
    };
    const run = T.tools.sun(p);
    run.cup = id; run.snap = snap;
    return run;
  }

  C.cupBegin = (tool, p) => {
    const id = p.target.cup;
    C.snap = takeSnap();
    if (tool === 'funnel') return cupFunnel(p, id);
    if (tool === 'sun') return cupSun(p, id);
    const r = demo(tool, p, cupTgt(id), {}); r.cup = id; return r;
  };

  C.cupFinish = (run) => {
    const id = run.cup, tool = run.tool, cs = LAB.CHAIN.cups;
    if (tool === 'funnel' && run.again) {      // 这杯已经滤过了
      C.misses++; C.pendingRestore = C.snap;
      ui.showResult('cups', 'funnel', { truth: LAB.TRUTH.cups.funnelAgain, again: { label: '再试一次', fn: C.retry } }); return true;
    }
    if (tool === 'funnel') {
      C.setHint(cs.sameLook, true); return true;
    }
    if (tool === 'sun') {
      const c = S.cups[id];
      if (!c.filtered) {        // 没过滤就蒸发：只剩面粉，看不出有没有盐
        C.misses++; C.pendingRestore = run.snap;
        ui.showResult('cups', 'sun', { truth: LAB.TRUTH.cups.sunRaw, again: { label: '再试一次', fn: C.retry } }); return true;
      }
      c.evap = true; C.renderBar();
      const both = S.cups.A.evap && S.cups.B.evap;
      if (both) askCup();
      else { C.setHint('还有一杯没晒。把另一杯也试一试。', true); }
      return true;
    }
    C.misses++; C.pendingRestore = C.snap;      // 手、漂浮法、筛子：照「水和面粉」那一行
    ui.showResult('cups', tool, { again: { label: '再试一次', fn: C.retry } });
    return true;
  };
  /* 「近看」面板（屏幕层，画在杯子的位置）：并排两个圆形近景，各是一小块浅盘盘底。A、B 大标签在圆外上方。风格参考滤纸放大镜。 */
  const PN = { x: 424, y: 216, w: 592, h: 448, R: 120, cy: 500, cxs: { A: 584, B: 864 } };
  C.panelCenters = PN.cxs;
  const PG = []; (() => { let sd = 91; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.78; PG.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: 6 + r() * 4, t: r(), b: r() }); } })();
  const PR = []; (() => { let sd = 17; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 90; i++) PR.push({ a: (i / 90) * TAU, w: 4 + r() * 6, o: 0.6 + r() * 0.4, j: (r() - 0.5) * 10 }); })();
  function panelCircle(ctx, id, salty, now) {
    const cx = 0, cy = 0, R = 130, t = now / 1000;
    ctx.save(); ctx.translate(PN.cxs[id], PN.cy); ctx.scale(PN.R / 130, PN.R / 130);       // 下面都按半径 130 画，再缩到面板里
    ctx.save(); ctx.shadowColor = 'rgba(40,25,5,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12; ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 6, 0, TAU); ctx.clip();
    const bg = ctx.createRadialGradient(cx - 40, cy - 50, 10, cx, cy, R); bg.addColorStop(0, '#f6f4f8'); bg.addColorStop(0.7, '#e6e3ea'); bg.addColorStop(1, '#c9c5d0');
    ctx.fillStyle = bg; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.strokeStyle = 'rgba(140,155,175,0.3)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, 96, 0, TAU); ctx.stroke();       // 淡淡一圈水痕：说明晒过
    if (salty) {
      for (const q of PR) { const x = cx + Math.cos(q.a) * (96 + q.j), y = cy + Math.sin(q.a) * (96 + q.j); ctx.fillStyle = `rgba(255,255,255,${q.o})`; ctx.beginPath(); ctx.arc(x, y, q.w, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(cx, cy, 94, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(253,254,255,0.6)'; ctx.beginPath(); ctx.arc(cx, cy, 88, 0, TAU); ctx.fill();
      for (const g of PG) {
        const x = cx + g.x * 100 - g.s / 2, y = cy + g.y * 100 - g.s / 2;
        ctx.fillStyle = 'rgba(80,90,110,0.38)'; ctx.fillRect(x + 1.5, y + 2, g.s, g.s * 0.85);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, g.s, g.s * 0.85); ctx.fillStyle = 'rgba(190,225,255,0.9)'; ctx.fillRect(x + 1, y + 1, g.s * 0.35, g.s * 0.3);
      }
      [[-0.45, 0.2, 2, 62], [0.15, 0.5, 4, 54], [0.5, -0.1, 1, 64], [-0.1, -0.45, 3, 50], [0.42, 0.45, 5, 46]].forEach(([ux, uy, k, wd], i) => {
        const img = A['salt' + k], sc = wd / img.width, x = cx + ux * 90, y = cy + uy * 90;
        ctx.save(); ctx.translate(x, y); ctx.drawImage(img, -wd / 2, -img.height * sc / 2, wd, img.height * sc); ctx.restore();
        const gl = Math.pow(Math.max(0, Math.sin(t * 1.6 + i * 2.1)), 8);
        if (gl > 0.05) { ctx.save(); ctx.translate(x - 8, y - 8); ctx.fillStyle = `rgba(255,255,255,${gl})`; ctx.fillRect(-1.5, -14 * gl, 3, 28 * gl); ctx.fillRect(-14 * gl, -1.5, 28 * gl, 3); ctx.restore(); }
      });
    }
    ctx.restore();
    const rg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rg.addColorStop(0, '#f4f6f8'); rg.addColorStop(0.5, '#9aa4ae'); rg.addColorStop(1, '#5b6570');
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, TAU); ctx.strokeStyle = rg; ctx.lineWidth = 12; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R - 26, Math.PI * 1.1, Math.PI * 1.42); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
    ctx.fillStyle = '#e7860a'; ctx.font = '900 64px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.strokeText(id, cx, cy - R - 36); ctx.fillText(id, cx, cy - R - 36);       // 标签在圆外上方
    ctx.restore();
  }
  function drawPanel(ctx, now) {
    if (!C.panelOn || !S.cups) return;
    const k = clamp((now - C.panelT0) / 350, 0, 1), e = 1 - Math.pow(1 - k, 3);
    ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * -20);
    ctx.shadowColor = 'rgba(60,35,5,0.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(255,248,230,0.97)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(PN.x, PN.y, PN.w, PN.h, 36) : ctx.rect(PN.x, PN.y, PN.w, PN.h); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#3a2a1a'; ctx.font = '900 34px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('近看浅盘：哪一杯有盐？', PN.x + PN.w / 2, PN.y + 40);
    for (const id of ['A', 'B']) panelCircle(ctx, id, S.cups.salty === id, now);
    ctx.restore(); ctx.textBaseline = 'alphabetic';
  }
  function askCup() {
    C.cupAsk = true; C.setHint(LAB.CHAIN.cups.ask, true);
    $('#cupask').classList.add('on'); ui.lockTools(true);
    T.after(0.6, () => { T.reset(); S.cups.hide = true; C.panelOn = true; C.panelT0 = performance.now(); T.overlay.push(drawPanel); });       // 杯子淡出让位，弹出「近看」面板
  }
  C.answer = (id) => {
    if (!C.cupAsk || C.done) return;
    if (id === S.cups.salty) {
      C.cupAsk = false; $('#cupask').classList.remove('on'); ui.lockTools(false); LAB.cam.reset(); C.panelOn = false; T.overlay.length = 0; S.cups.hide = false;
      LAB.glow(['cup' + id, 'dish'], LAB.clock);
      complete();
    } else {
      C.wrongAnswers++;
      ui.showResult('cups', 'wrongPick', { truth: LAB.TRUTH.cups.wrongPick, title: '再想想', prop: false, again: { label: '再选一次', fn: () => ui.hideResult() } });
    }
  };
  $('#cupask').addEventListener('click', (e) => { const b = e.target.closest('button[data-cup]'); if (b) C.answer(b.dataset.cup); });

  /* ───────── 钩子（modes.js 的分发器在连环关里转到这里）───────── */
  C.canGrab = () => !C.cupAsk && !C.done;
  C.resetForGrab = () => {
    if (C.kind === 'sandsalt') C.loadStage(C.stage);
    else { cupsRestore(); T.reset(); }
  };
  C.dropTarget = (probe) => {
    if (C.kind === 'cups') { const id = cupAt(probe); return id ? { cup: id } : null; }
    if (T.overBowl(probe)) return {};
    if (C.stage === 2 && probe.x > 1250 && probe.y > 300 && probe.y < 760) return {};
    return null;
  };
  C.dropMsg = () => (C.kind === 'cups' ? '把工具拖到 A 杯或 B 杯上再放开' : C.stage === 2 ? '把工具拖到烧杯或大碗上再放开' : '把工具拖到大碗上再放开');
  C.begin = (tool, target) => {
    if (C.kind === 'cups') return (p) => C.cupBegin(tool, p);
    const st = C.stage;
    if (st === 0) return T.tools[tool];                                          // 加水搅一搅、其他 6 个工具（干的沙和盐）
    if (st === 1) {
      if (tool === 'addwater') return (p) => demo('addwater', p, bowlTgt());     // 已经加过水了
      return T.tools[tool];                                                      // 虚拟混合物 sandsalt1：照「沙和水」的真实演出
    }
    if (tool === 'sun') return T.tools.sun;                                      // 第 3 步：烧杯里的盐水倒进浅盘晒
    return (p) => demo(tool, p, beakTgt());                                      // 其他工具：对烧杯里的盐水示意一下
  };
  C.finish = (run) => {
    if (C.kind === 'cups') return C.cupFinish(run);
    const tool = run.tool, st = C.stage;
    if (st === 0 && tool === 'addwater') { advance(1, run); return true; }
    if (st === 1 && tool === 'funnel') { advance(2, run); return true; }
    if (st === 2 && tool === 'sun') { complete(); return true; }
    C.misses++;
    return false;                                                                // 默认：按 TRUTH[sandsalt / sandsalt1 / sandsalt2] 出 ❌
  };
  C.again = () => ({ label: '再试一次', fn: C.retry });
})();
