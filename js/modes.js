/* 分离大法实验室 · 开场画面与四种玩法（SPEC 第 14 节）
   开场：工具名大字＋4 张大卡片：自由实验／先猜再试（老师示范）／闯关／溶解赛跑（连到 race.html，由另一页做）。
   每个玩法左上角都有「回到开场」。这里也是 LAB.hooks 的分发器：连环关（chain.js）进行时，钩子转给它。
   舞台的 class 控制显示哪些东西：m-home / m-free / m-predict(pp-pick|pp-set|pp-test) / m-qmap / m-quest / m-chain / m-cups，加 q＝闯关里的大挑战。 */
(function () {
  'use strict';
  const LAB = window.LAB, T = LAB.T, ui = LAB.ui, C = LAB.chain, S = LAB.S;
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const M = LAB.modes = { mode: 'home', phase: null };
  LAB.mode = 'home';
  const CHECK = LAB.ICON ? LAB.ICON.ok : '';
  const STAR = 'M12 2.2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21.2 7 14.4 2 9.5l6.9-1z';
  const starSvg = (on, id) => `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="sg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f0a41c"/></linearGradient></defs><path d="${STAR}" fill="${on ? `url(#sg${id})` : '#e6dcc6'}" stroke="${on ? '#b87a00' : '#cbbfa4'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  LAB.MODE_SAY = [
    { v: 'X', t: '全班先猜一猜：每个工具，能不能把它们分开？点一下格子换答案，猜好了就按开始试。' },
    { v: 'X', t: '开始试！每试一个工具，就看看谁猜对了。' },
    { v: 'X', t: '先选一个混合物。' },
    { v: 'X', t: '全部通关了，太棒了！' },
  ];
  const say = (i) => { if (LAB.voice) LAB.voice.sayNarr(LAB.MODE_SAY[i].t); };

  /* ───────── 模式切换 ───────── */
  function setClass(cls) { const sm = stage.classList.contains('sm'), rs = stage.classList.contains('res'); stage.className = cls + (sm ? ' sm' : '') + (rs ? ' res' : ''); }       // sm＝舞台缩得很小（手机横放），由 ui.js 的 fit() 设
  function resetStage(tools) {
    if (C.active) C.stop();
    T.reset(); ui.setTools(tools || LAB.TOOLS.slice());
    ui.lockTools(false); ui.chosen = false; ui.mixId = 'empty'; ui.resetMix();
    $('#final').classList.remove('on'); $('#cupask').classList.remove('on');
    if (LAB.voice) LAB.voice.stop();
    if (LAB.guideReset) LAB.guideReset();
  }
  M.go = (mode, arg) => {
    M.mode = LAB.mode = mode; M.phase = null;
    LAB.hooks.propsOn = mode === 'free' || mode === 'quest';
    if (mode === 'home') { resetStage(); setClass('m-home'); }
    else if (mode === 'free') { resetStage(); ui.setPage(0); setClass('m-free'); }
    else if (mode === 'predict') { resetStage(); ui.setPage(0); predictPick(); }
    else if (mode === 'qmap') { resetStage(); buildMap(); setClass('m-qmap'); }
  };
  M.start = () => { buildHome(); M.go('home'); };

  /* ───────── 开场 ───────── */
  function buildHome() {
    const img = (src, st) => `<img src="assets/${src}" alt="" draggable="false" style="${st}">`;
    const home = $('#home');
    home.innerHTML = `
      <h1 class="ttl">分离大法实验室</h1>
      <p class="sub">二年级科学 · 混合物：想一想，用哪个办法把它们分开？</p>
      <div class="cards">
        <button type="button" class="hcard c1" data-go="free"><div class="art">
          ${img('tools/tool-magnet.png', 'left:-2px;top:62px;height:112px;transform:rotate(-14deg)')}
          ${img('tools/tool-sieve.png', 'left:74px;top:30px;height:116px;z-index:2')}
          ${img('tools/tool-funnel.png', 'right:-4px;top:58px;height:116px;transform:rotate(12deg);z-index:3')}
          ${img('items/nail-3.png', 'left:36px;bottom:6px;width:96px;transform:rotate(-18deg)')}
          ${img('items/leaf-2.png', 'right:34px;bottom:0;width:104px;transform:rotate(14deg)')}
        </div><div class="nm">自由实验</div><p class="ds">6 个工具随便用<br>看看哪个办法行得通</p></button>
        <button type="button" class="hcard c2" data-go="predict"><div class="art">
          <svg viewBox="0 0 160 160" style="left:26px;top:2px;width:170px;height:170px"><defs><radialGradient id="qg" cx=".35" cy=".3"><stop offset="0" stop-color="#8fc4f5"/><stop offset="1" stop-color="#2b6cc0"/></radialGradient></defs><circle cx="80" cy="80" r="70" fill="url(#qg)" stroke="#1b4a8a" stroke-width="5"/><text x="80" y="112" text-anchor="middle" font-family="Noto Sans SC,sans-serif" font-weight="900" font-size="104" fill="#fff">?</text></svg>
          ${img('tools/hand-point.png', 'right:14px;top:70px;height:150px;transform:rotate(-8deg)')}
          ${img('tools/tool-magnet.png', 'left:10px;bottom:4px;height:92px;transform:rotate(-10deg)')}
        </div><div class="nm">先猜再试</div><p class="ds">老师带全班先猜<br>再试一试，看谁猜对</p></button>
        <button type="button" class="hcard c3" data-go="qmap"><div class="art">
          <svg viewBox="0 0 24 24" style="left:96px;top:0;width:110px;height:110px">${starSvg(true, 'h1').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
          <svg viewBox="0 0 24 24" style="left:10px;top:50px;width:96px;height:96px;transform:rotate(-12deg)">${starSvg(true, 'h2').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
          <svg viewBox="0 0 24 24" style="left:196px;top:50px;width:96px;height:96px;transform:rotate(12deg)">${starSvg(true, 'h3').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
          ${img('tools/tool-sun.png', 'left:112px;top:128px;height:112px')}
          ${img('items/coin-2.png', 'left:12px;bottom:8px;width:82px')}
          ${img('items/button-3.png', 'right:14px;bottom:10px;width:80px')}
        </div><div class="nm">闯关</div><p class="ds">一共 13 关<br>从简单到大挑战</p></button>
        <a class="hcard c4" href="race.html"><div class="art">
          ${img('tools/tool-cup.png', 'left:4px;top:62px;height:150px')}
          ${img('tools/tool-cup.png', 'left:88px;top:44px;height:170px;z-index:2')}
          ${img('tools/tool-cup.png', 'left:176px;top:62px;height:150px')}
          ${img('tools/stopwatch.png', 'right:0;top:0;height:96px;z-index:3')}
          ${img('items/sugarcube-1.png', 'left:112px;top:12px;width:62px;z-index:3')}
        </div><div class="nm">溶解赛跑</div><p class="ds">三杯水比一比<br>看哪杯的糖先溶完</p></a>
      </div>`;
    home.querySelectorAll('button[data-go]').forEach((b) => b.addEventListener('click', () => M.go(b.dataset.go)));
  }
  $('#back').addEventListener('click', () => M.go('home'));
  $('#mute').addEventListener('click', () => { if (LAB.voice) LAB.voice.setOn(!LAB.voice.on); $('#mute').setAttribute('aria-pressed', LAB.voice && !LAB.voice.on ? 'true' : 'false'); });

  /* ───────── 先猜再试（老师示范）───────── */
  const pb = $('#pboard');
  const pred = {};                                   // 每个工具的预测：null／'yes'／'no'
  const GUESS = { none: ['？', ''], yes: ['能', 'yes'], no: ['不能', 'no'] };
  function predictPick() {
    setClass('m-predict pp-pick'); M.phase = 'pick';
    ui.lockTools(true); LAB.TOOLS.forEach((t) => { pred[t.key] = null; });
    if (LAB.voice) LAB.voice.sayNarr(LAB.MODE_SAY[2].t);
  }
  /* 预测板（底部一排）：左「换一个混合物」、中间 6 格、右「开始试」。每格三行：工具名／猜：能·不能·？／试过后才出现「结果」徽章＋文字。
     猜对的那格整格亮绿边框。「开始试」是蓝色实心主按钮：没猜完前颜色浅一点，但仍可按。 */
  function buildBoard() {
    const x0 = 48;
    pb.innerHTML = `<button type="button" class="pbtn alt" id="pchange" style="left:${x0}px">换一个<br>混合物</button>` +
      LAB.TOOLS.map((t, i) => `<button type="button" class="pcell" data-t="${t.key}" data-g="none" style="left:${x0 + 176 + i * 192}px"><b>${t.name}</b><span class="g">猜：<em>？</em></span><span class="r"><i></i><em></em></span></button>`).join('') +
      `<button type="button" class="pbtn go" id="pstart" style="left:${x0 + 176 + 6 * 192}px">开始试</button>`;
    pb.querySelector('#pchange').addEventListener('click', () => { ui.mixId = 'empty'; ui.chosen = false; ui.resetMix(); predictPick(); });
    pb.querySelector('#pstart').addEventListener('click', predictStart);
    pb.querySelectorAll('.pcell').forEach((c) => c.addEventListener('click', () => {
      if (M.phase !== 'set') return;
      const k = c.dataset.t; pred[k] = pred[k] === null ? 'yes' : pred[k] === 'yes' ? 'no' : null; paintCell(c); paintStart();
    }));
  }
  function paintCell(c) {
    const p = pred[c.dataset.t] || 'none';
    c.dataset.g = p; c.querySelector('.g em').textContent = GUESS[p][0];
  }
  function paintStart() { const all = LAB.TOOLS.every((t) => pred[t.key]); pb.querySelector('#pstart').classList.toggle('dim', !all); }
  function predictSet(id) {
    setClass('m-predict pp-set'); M.phase = 'set';
    LAB.TOOLS.forEach((t) => { pred[t.key] = null; });
    buildBoard(); pb.querySelectorAll('.pcell').forEach(paintCell); paintStart();
    const tb = $('#taskbar'); tb.querySelector('.tb-no').textContent = '猜'; tb.querySelector('.tb-txt').textContent = '全班先猜，点格子换答案，再按「开始试」';
    say(0);
  }
  function predictStart() {
    setClass('m-predict pp-test'); M.phase = 'test';
    ui.lockTools(false); ui.chosen = true;
    pb.querySelectorAll('.pcell').forEach((c) => c.classList.add('lock'));
    $('#pstart').disabled = true; $('#pstart').classList.remove('dim');
    say(1);
  }
  function predictReveal(mix, tool, kind) {
    const c = pb.querySelector(`.pcell[data-t="${tool}"]`); if (!c) return;
    c.dataset.k = kind; c.classList.add('rev');
    c.querySelector('.r i').innerHTML = LAB.ICON[kind]; c.querySelector('.r em').textContent = LAB.KIND_LABEL[kind];
    const p = pred[tool];
    const hit = (p === 'yes' && kind === 'ok') || (p === 'no' && kind === 'no');       // ⚠️「差一点」：既不算能、也不算不能，不亮
    c.classList.remove('hit'); if (hit) { void c.offsetWidth; c.classList.add('hit'); }
  }

  /* ───────── 闯关 ───────── */
  const KEY = 'tahun2-dst-campuran-lab:stars';
  const stars = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const saveStars = () => { try { localStorage.setItem(KEY, JSON.stringify(stars)); } catch (e) { /* 读不到存不了就当没有 */ } };
  M.stars = stars;
  const FLAT = []; LAB.LEVELS.forEach((g) => g.items.forEach((it) => FLAT.push(it)));
  FLAT.forEach((it, i) => { it.no = i + 1; });
  const Q = M.Q = { idx: -1, lv: null, failed: 0, propMistakes: 0, propDone: false, ok: false };

  function buildMap() {
    const el = $('#qmap');
    el.innerHTML = `<h2 class="ttl">闯关：选一关</h2><div class="cols">` + LAB.LEVELS.map((g) => `<div class="col"><h3>${g.g}</h3>` +
      g.items.map((it) => { const n = stars[it.id] || 0, nx = it.no === (FLAT.find((q) => !stars[q.id]) || {}).no; return `<button type="button" class="lvl${nx ? ' next' : ''}" data-i="${it.no - 1}"><span class="no">${it.no}</span><span class="nm">${LAB.levelName(it)}</span><span class="stars">${[1, 2, 3].map((s) => starSvg(n >= s, 'm' + it.no + s)).join('')}</span></button>`; }).join('') + '</div>').join('') + '</div>';
    el.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => startLevel(+b.dataset.i)));
  }
  function startLevel(i) {
    const lv = FLAT[i]; Q.idx = i; Q.lv = lv; Q.failed = 0; Q.propMistakes = 0; Q.propDone = false; Q.ok = false;
    M.mode = LAB.mode = 'quest'; LAB.hooks.propsOn = true;
    resetStage();
    const tb = $('#taskbar'); tb.querySelector('.tb-no').textContent = '第 ' + lv.no + ' 关'; tb.querySelector('.tb-txt').textContent = LAB.levelTask(lv);
    if (lv.chain) {
      LAB.hooks.propsOn = false;
      setClass('m-' + (lv.chain === 'cups' ? 'cups' : 'chain') + ' q');
      C.start(lv.chain, { quest: true, onComplete: (r) => finishLevel(r.stars) });
    } else {
      setClass('m-quest');
      ui.setTools(LAB.TOOLS.slice()); ui.mixId = lv.id; ui.chosen = true; ui.resetMix();
      if (LAB.voice) LAB.voice.sayNarr(LAB.levelTask(lv));
    }
  }
  function finishLevel(n) {
    const lv = Q.lv;
    if (n > (stars[lv.id] || 0)) { stars[lv.id] = n; saveStars(); }
    ui.hideResult();
    if (Q.idx + 1 < FLAT.length) startLevel(Q.idx + 1); else showFinal();
  }
  function showFinal() {
    if (C.active) C.stop();
    const total = FLAT.reduce((a, it) => a + (stars[it.id] || 0), 0);
    const f = $('#final');
    f.innerHTML = `<h2 class="ttl">全部通关！</h2><div class="big">${[1, 2, 3].map((s) => starSvg(true, 'f' + s)).join('')}</div><p>一共得到 ${total} 颗星（最多 ${FLAT.length * 3} 颗）</p><div class="row"><button type="button" data-a="map">回到选关</button><button type="button" class="alt" data-a="home">回到开场</button></div>`;
    f.classList.add('on'); say(3);
    f.querySelector('[data-a="map"]').addEventListener('click', () => { f.classList.remove('on'); M.go('qmap'); });
    f.querySelector('[data-a="home"]').addEventListener('click', () => { f.classList.remove('on'); M.go('home'); });
  }

  /* ───────── 钩子分发 ───────── */
  const H = LAB.hooks;
  H.canGrab = (k) => {
    if (C.active) return C.canGrab(k);
    if (M.mode === 'home' || M.mode === 'qmap') return false;
    if (M.mode === 'predict' && M.phase !== 'test') return false;
    return true;
  };
  H.resetForGrab = (k) => (C.active ? C.resetForGrab(k) : ui.resetMix());
  H.dropTarget = (probe) => (C.active ? C.dropTarget(probe) : (T.overBowl(probe) ? {} : null));
  H.dropMsg = () => (C.active ? C.dropMsg() : '把工具拖到大碗上再放开');
  H.begin = (tool, target) => (C.active ? C.begin(tool, target) : null);
  H.finish = (run) => (C.active ? C.finish(run) : false);
  H.again = (kind) => {
    if (C.active) return C.again();
    if (M.mode === 'quest') return kind === 'ok' ? { label: LAB.PHRASE.next, fn: () => finishLevel(starsNow()) } : { label: LAB.PHRASE.tryOther, fn: () => ui.resetMix() };
    return null;
  };
  H.extra = (kind, mix) => (M.mode === 'free' && mix === 'sandsalt' && !C.active
    ? { hint: LAB.PHRASE.freeHint, label: LAB.PHRASE.freeGo, fn: () => M.enterChain('sandsalt') } : null);
  H.onSelect = (id) => { if (M.mode === 'predict' && M.phase === 'pick') predictSet(id); };
  H.onResult = (mix, tool, kind) => {
    if (M.mode === 'predict' && M.phase === 'test') predictReveal(mix, tool, kind);
    if (M.mode === 'quest' && !C.active && !Q.ok) { if (kind === 'ok') Q.ok = true; else Q.failed++; }
  };
  H.onProp = (correct, mistakes) => { if (M.mode === 'quest') { Q.propMistakes = mistakes; if (correct) Q.propDone = true; } };
  /* 星星：第一个工具就 ✅ 而且性质卡第一次就选对＝3 星；其中一项没做到＝2 星；其他＝1 星 */
  function starsNow() { const a = Q.failed === 0, b = Q.propMistakes === 0; return a && b ? 3 : (a || b) ? 2 : 1; }
  M.starsNow = starsNow;

  M.enterChain = (kind) => {                  // 自由实验里沙和盐结果卡的「去试试」
    M.mode = LAB.mode = 'chain'; LAB.hooks.propsOn = false;
    resetStage(); setClass('m-chain');
    C.start(kind, { quest: false });
  };
})();
