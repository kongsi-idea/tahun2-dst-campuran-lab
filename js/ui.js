/* 分离大法实验室 · 界面与主循环：舞台缩放、工具栏／混合物卡、结果卡、手机转横提示、测试钩子。 */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { W, H, S, rand, clamp, lerp } = LAB;
  const T = LAB.T;
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d'), cv2 = $('#cv2'), ctx2 = cv2.getContext('2d');   // cv2：屏幕层，盖在 DOM 工具栏上面（拿着的工具、手、太阳不会被工具栏遮住）
  const ui = LAB.ui = { resultShown: false };
  LAB.paused = false; LAB.speed = 1; LAB.clock = 0;

  /* ── 镜头：筛子、滤纸、蒸发时场景平滑推近；工具栏、底部卡片、结果卡是 DOM，不跟着缩放 ── */
  const cam = LAB.cam = {
    z: 1, cx: W / 2, cy: H / 2, tz: 1, tcx: W / 2, tcy: H / 2,
    focus(z, x, y) { this.tz = z; this.tcx = clamp(x, W / 2 / z, W - W / 2 / z); this.tcy = clamp(y, H / 2 / z, H - H / 2 / z); },
    reset() { this.tz = 1; this.tcx = W / 2; this.tcy = H / 2; },
    toWorld(p) { return { x: (p.x - W / 2) / this.z + this.cx, y: (p.y - H / 2) / this.z + this.cy }; },
    toScreen(p) { return { x: (p.x - this.cx) * this.z + W / 2, y: (p.y - this.cy) * this.z + H / 2 }; },
    step(dt) { const k = Math.min(1, dt * 4.5); this.z += (this.tz - this.z) * k; this.cx += (this.tcx - this.cx) * k; this.cy += (this.tcy - this.cy) * k; if (Math.abs(this.tz - this.z) < 0.002) { this.z = this.tz; this.cx = this.tcx; this.cy = this.tcy; } },
  };

  /* ── 舞台等比缩放（照 tahun1-bc-shizi-explore 的 fit）── */
  let scale = 1, q = 1;
  function fit() {
    const w = innerWidth, h = innerHeight;
    scale = Math.min(w / W, h / H);
    stage.classList.toggle('sm', scale < 0.6);       // 手机横放：点击区域放大到缩放后仍 ≥44px
    stage.style.transform = `translate(${(w - W * scale) / 2}px,${(h - H * scale) / 2}px) scale(${scale})`;
    // 画布实际分辨率：跟着屏幕走，但不超过 1.5 倍
    const nq = clamp(scale * (window.devicePixelRatio || 1) * 1.5, 0.9, 2.2);
    if (Math.abs(nq - q) > 0.01 || cv.width !== Math.round(W * nq)) { q = nq; cv.width = cv2.width = Math.round(W * q); cv.height = cv2.height = Math.round(H * q); }
    checkRotate();
  }
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 60));

  /* ── 手机转横提示：matchMedia + 短边判断，不用 screen.orientation.lock ── */
  const mqPortrait = matchMedia('(orientation: portrait)');
  const rotEl = $('#rotate');
  function checkRotate() {
    const portrait = mqPortrait.matches || innerHeight > innerWidth;
    const small = Math.min(innerWidth, innerHeight) < 900;       // 手机，或舞台会缩得太小的直立平板
    const show = portrait && small;
    rotEl.classList.toggle('show', show);
    LAB.paused = show;
  }
  if (mqPortrait.addEventListener) mqPortrait.addEventListener('change', checkRotate); else mqPortrait.addListener(checkRotate);

  /* ── 工具栏：6 张工具卡；连环关多第 7 张「加水搅一搅」（卡变窄一点）── */
  const toolbar = $('#toolbar');
  ui.toolList = LAB.TOOLS.slice();
  ui.setTools = (list) => {
    ui.toolList = list;
    toolbar.innerHTML = ''; toolbar.classList.toggle('n7', list.length > 6);
    const cw = list.length > 6 ? 164 : 192, step = list.length > 6 ? 172 : 200, off = list.length > 6 ? 26 : 28;
    toolbar.style.setProperty('--cw', cw + 'px');
    list.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'card'; el.dataset.tool = t.key; el.style.left = (off + step * i) + 'px';
      el.innerHTML = `<img src="assets/tools/${t.key === 'hand' ? 'hand-open' : 'tool-' + t.key}.png" alt="" draggable="false"><span>${t.name}</span>`;
      toolbar.appendChild(el);
      const im = el.querySelector('img'); let tries = 0;
      im.onerror = () => { if (tries++ < 4) setTimeout(() => { im.src = im.src.split('?')[0] + '?r=' + tries; }, 400); };       // 本机预览服务偶尔断线，图没载入就重试
    });
    ui.tbGeom = { cw, step, off };
  };
  /* 第 i 张卡的图中心（舞台坐标），工具飞回卡片、示范手都用它 */
  ui.cardCenter = (key) => {
    const i = Math.max(0, ui.toolList.findIndex((t) => t.key === key)), g = ui.tbGeom;
    return { x: 184 + g.off + g.step * i + g.cw / 2, y: 104 };
  };
  ui.setCardAway = (key, on) => { const el = toolbar.querySelector(`[data-tool="${key}"]`); if (el) el.classList.toggle('away', !!on); };
  ui.lockTools = (on) => { toolbar.style.opacity = on ? '.45' : ''; };
  ui.setTools(LAB.TOOLS.slice());

  /* ── 底部混合物卡：每页 4 张，左右箭头翻页（箭头和卡片都 ≥104 舞台像素，手机横放仍 ≥44px）── */
  const mixes = $('#mixes');
  const PER = 4, CARD_W = 296, GAP = 16, MX0 = 184;
  ui.mixPage = 0;
  const CHEV = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="#5a4326" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const pgL = document.createElement('button'), pgR = document.createElement('button');
  pgL.type = pgR.type = 'button'; pgL.className = pgR.className = 'pg'; pgL.style.left = '48px'; pgR.style.right = '48px';
  pgL.setAttribute('aria-label', '上一页'); pgR.setAttribute('aria-label', '下一页');
  pgL.innerHTML = CHEV('M15 4l-8 8 8 8'); pgR.innerHTML = CHEV('M9 4l8 8-8 8');
  const dots = document.createElement('div'); dots.className = 'dots';
  mixes.append(pgL, pgR, dots);
  LAB.MIXES.forEach((m, i) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'mix'; el.dataset.mix = m.id;
    const th = m.thumb.map((t) => (t.includes('/') ? `<img src="assets/${t}" alt="" draggable="false">` : `<span class="sw ${t}"></span>`)).join('');
    el.innerHTML = `<span class="th">${th}</span><b${m.name.length > 5 ? ' class="long"' : ''}>${m.name}</b>`;
    el.addEventListener('click', () => ui.selectMix(m.id));
    mixes.appendChild(el);
  });
  const nPages = Math.ceil(LAB.MIXES.length / PER);
  dots.innerHTML = '<i></i>'.repeat(nPages);
  ui.mixPos = (i) => ({ x: MX0 + (i % PER) * (CARD_W + GAP) + CARD_W / 2, y: 804 });
  ui.setPage = (n) => {
    ui.mixPage = clamp(n, 0, nPages - 1);
    mixes.querySelectorAll('.mix').forEach((el, i) => {
      const on = Math.floor(i / PER) === ui.mixPage;
      el.style.display = on ? '' : 'none'; el.style.left = (MX0 + (i % PER) * (CARD_W + GAP)) + 'px';
    });
    pgL.disabled = ui.mixPage === 0; pgR.disabled = ui.mixPage === nPages - 1;
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === ui.mixPage));
  };
  pgL.addEventListener('click', () => ui.setPage(ui.mixPage - 1));
  pgR.addEventListener('click', () => ui.setPage(ui.mixPage + 1));
  ui.setPage(0);
  ui.selectMix = (id) => {
    ui.mixId = id; ui.chosen = true;
    const i = LAB.MIXES.findIndex((m) => m.id === id); if (i >= 0) ui.setPage(Math.floor(i / PER));
    ui.resetMix();
    if (LAB.hooks.onSelect) LAB.hooks.onSelect(id);
  };
  ui.resetMix = () => {
    T.reset();
    LAB.resetMix(ui.mixId);
    document.querySelectorAll('.mix').forEach((e) => e.classList.toggle('on', e.dataset.mix === ui.mixId));
    ui.resultShown = false;
    if (ui.onReset) ui.onReset();
  };

  /* ── 提示、吐司、结果卡 ── */
  const tipEl = $('#tip'), toastEl = $('#toast'), resEl = $('#result');
  ui.tip = () => {};      // 一行会消失的小提示，已由常驻的步骤条（guide.js）取代
  let toastTimer;
  ui.toast = (m) => { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000); };
  const ICON = {
    ok: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    part: '<svg viewBox="0 0 24 24"><path d="M12 4.5v9" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round"/><circle cx="12" cy="19" r="2.2" fill="#fff"/></svg>',
    no: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>',
  };
  LAB.ICON = ICON;
  const againBtn = $('#again'), goBtn = $('#go'), hintEl = resEl.querySelector('.extra .hint');
  /* 结果卡。opt：truth＝[kind, 原因句]（连环关／两杯找盐用自己的）；prop＝要不要出性质卡；again＝{label, fn}；extra＝{hint, label, fn}；left＝放左边 */
  ui.showResult = (mix, tool, opt) => {
    opt = opt || {};
    const [kind, text] = opt.truth || LAB.TRUTH[mix][tool];
    resEl.dataset.kind = kind; resEl.dataset.mix = mix; resEl.dataset.tool = tool; resEl.classList.toggle('left', tool === 'funnel' || !!opt.left);
    resEl.querySelector('.badge').innerHTML = ICON[kind];
    resEl.querySelector('.title').textContent = opt.title || LAB.KIND_LABEL[kind];
    resEl.querySelector('.why').textContent = text;
    // 再来一次钮：各玩法可以换名字、换动作（闯关的「下一关」「再试别的工具」）
    const ag = opt.again || (LAB.hooks.again ? LAB.hooks.again(kind, mix, tool) : null) || { label: LAB.PHRASE.again, fn: () => ui.resetMix() };
    againBtn.textContent = ag.label; ui.againFn = ag.fn;
    // 额外提示（沙和盐：「要不要试试连环分离？」）
    const ex = opt.extra || (LAB.hooks.extra ? LAB.hooks.extra(kind, mix, tool) : null);
    resEl.classList.toggle('hasx', !!ex);
    if (ex) { hintEl.textContent = ex.hint; goBtn.textContent = ex.label; ui.goFn = ex.fn; }
    // 性质卡：只有 ✅ 才出（自由实验、闯关）
    resEl.classList.remove('hasp', 'pdone');
    const wantProp = opt.prop !== false && kind === 'ok' && LAB.props && LAB.props.enabled(mix, tool);
    if (wantProp) { resEl.classList.add('hasp'); LAB.props.show(resEl, mix, tool); }
    resEl.classList.add('show'); ui.resultShown = true; stage.classList.add('res');       // 结果卡在时，底部混合物卡暂时淡出，不被盖住
    if (LAB.voice) LAB.voice.sayResult(kind, text, opt.title);
    if (LAB.hooks.onResult) LAB.hooks.onResult(mix, tool, kind, opt);
  };
  ui.hideResult = () => { resEl.classList.remove('show', 'hasp', 'pdone', 'hasx'); ui.resultShown = false; stage.classList.remove('res'); };
  ui.propDone = () => { resEl.classList.add('pdone'); };
  againBtn.addEventListener('click', () => { if (ui.againFn) ui.againFn(); });
  goBtn.addEventListener('click', () => { if (ui.goFn) ui.goFn(); });
  ui.againFn = () => ui.resetMix();

  /* ── 指针：工具卡拖出、画面上的操作（点、拖） ── */
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  stage.addEventListener('pointerdown', (e) => {
    if (LAB.paused) return;
    const card = e.target.closest && e.target.closest('.card');
    if (card) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (_) {} T.grab(card.dataset.tool, pt(e)); return; }
    if (e.target === cv) { try { stage.setPointerCapture(e.pointerId); } catch (_) {} const ps = pt(e); T.sceneDown(cam.toWorld(ps), ps); }
  });
  stage.addEventListener('pointermove', (e) => { const ps = pt(e); T.move(ps); T.sceneMove(cam.toWorld(ps), ps); });
  const up = (e) => { const ps = pt(e); T.release(ps); T.sceneUp(cam.toWorld(ps), ps); };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ── 主循环 ── */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000); last = now;
    if (!LAB.paused) {
      const dt = real * LAB.speed;
      LAB.clock += dt * 1000;
      T.update(dt); LAB.scene.update(dt);
    }
    ctx.setTransform(q, 0, 0, q, 0, 0);
    cam.step(real);
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy);
    LAB.scene.draw(ctx, LAB.clock);
    LAB.scene.drawFx(ctx);
    T.draw(ctx, LAB.clock);
    ctx.restore();
    ctx2.setTransform(q, 0, 0, q, 0, 0); ctx2.clearRect(0, 0, W, H);
    T.drawScreen(ctx2, LAB.clock);
  }

  /* ── 测试钩子：window.__debug.run(混合物, 工具) 用同一套处理函数自动操作，返回结果卡内容 ── */
  const frames = (n = 1) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const simWait = async (sec) => { const t0 = T.clock; let guard = 0; while (T.clock - t0 < sec && guard++ < 4000) await frames(1); };
  async function waitResult(maxSim) {
    const t0 = T.clock; let guard = 0;
    while (!ui.resultShown && T.clock - t0 < maxSim && guard++ < 20000) await frames(1);
    await simWait(0.6);
  }
  async function autoRun(mixId, tool) {
    if (LAB.mode !== 'free') { LAB.modes.go('free'); await frames(2); }
    ui.mixId = mixId; ui.chosen = true; ui.resetMix();
    await frames(3);
    const c = T.cardPos(tool);
    T.grab(tool, { x: c.x, y: c.y + 30 });
    const ironY = Math.max(0, ...S.items.filter((i) => LAB.IRON[i.kind]).map((i) => i.y));
    const my = ironY > 560 ? 500 : 410;             // 铁东西在碗底（树枝和硬币），磁铁要放低一点才够得到
    const target = tool === 'magnet' ? { x: BOWL().cx - 220, y: my } : { x: BOWL().cx, y: 500 };
    for (let i = 1; i <= 14; i++) { T.move({ x: lerp(c.x, target.x, i / 14), y: lerp(c.y + 30, target.y, i / 14) }); await frames(1); }
    if (tool === 'magnet') {
      let t = 0; const t0 = T.clock;
      while (!ui.resultShown && T.clock - t0 < 30) {
        t += 0.016; const x = BOWL().cx + Math.sin(t * 2.2) * 250, y = my + Math.sin(t * 3.1) * 10;
        if (T.held && !T.held.locked) T.move({ x, y: y + 30 });
        await frames(1);
      }
      await simWait(0.8); if (T.held) T.release({ x: 0, y: 0 });
    } else {
      T.release(target);
      await frames(2);
      const run = T.run;
      if (tool === 'hand') {
        let guard = 0;
        while (!ui.resultShown && guard++ < 400) {
          await simWait(0.5);
          if (!T.run || !T.run.queue) break;
          if (T.run.cur || T.run.queue.length) continue;
          const it = S.items.find((i) => T.run.isPickable(i));
          if (it) T.sceneDown({ x: it.x, y: it.y }); else if (S.mix.water || S.mix.base) T.sceneDown({ x: BOWL().cx, y: 500 });
          else await simWait(1);
        }
      } else if (tool === 'sieve') {
        let guard = 0; while (T.run && T.run.phase !== 'shake' && guard++ < 3000) await frames(1);
        if (T.run && !ui.resultShown && !S.mix.water) {
          await simWait(1);
          const sv = LAB.SIEVE_POS; T.sceneDown({ x: sv.x, y: sv.y });
          let t = 0; const t0 = T.clock;
          while (!ui.resultShown && T.clock - t0 < 25) { t += 0.05; const w = { x: sv.x + Math.sin(t * 9) * 55, y: sv.y }; T.sceneMove(w); await frames(1); }
          T.sceneUp({ x: sv.x, y: sv.y });
        }
      } else if (tool === 'sun') {
        let guard = 0; while (T.run && T.run.phase !== 'sun' && guard++ < 3000) await frames(1);
        const r = T.run;
        if (r) { const s = r.pos(0); T.sceneDown(cam.toWorld(s), s); const sk = LAB.SKY; const t0 = T.clock;
          while (!ui.resultShown && T.clock - t0 < 20) { const k = clamp((T.clock - t0) / 4, 0, 1); const sp = { x: lerp(sk.p0.x, sk.p1.x, k), y: 300 }; T.sceneMove(cam.toWorld(sp), sp); await frames(1); }
          T.sceneUp({ x: 0, y: 0 }, { x: 0, y: 0 }); }
      }
    }
    await waitResult(40);
    const kind = resEl.dataset.kind, text = resEl.querySelector('.why').textContent, title = resEl.querySelector('.title').textContent;
    return { mix: mixId, tool, shown: ui.resultShown, kind, title, text, popts: [...resEl.querySelectorAll('.popt')].map((b) => b.dataset.p), hasx: resEl.classList.contains('hasx'), xhint: resEl.querySelector('.extra .hint').textContent, xbtn: resEl.querySelector('#go').textContent, icon: resEl.querySelector('.badge svg') ? resEl.querySelector('.badge svg').innerHTML.slice(0, 20) : '' };
  }
  const BOWL = () => LAB.GEO.BOWL;
  window.__debug = Object.assign(window.__debug || {}, { run: autoRun, state: () => ({ mix: S.mix && S.mix.id, shown: ui.resultShown, paused: LAB.paused, held: !!T.held, fx: S.fx.length, run: T.run && T.run.tool, phase: T.run && T.run.phase }), LAB });

  /* ── 开机 ── */
  fit();
  LAB.loadAssets().then(() => {
    ui.mixId = 'empty'; ui.resetMix();      // 第 1 步：不预设混合物，没有选中框，大碗是空的
    requestAnimationFrame(frame);
    window.__ready = true;
    if (LAB.modes) LAB.modes.start();       // 开场画面
  }).catch((err) => { console.error(err); document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;left:20px;top:20px;color:#fff;font:700 24px sans-serif">素材没载入，请重新整理页面</p>'); });
})();
