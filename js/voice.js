/* 分离大法实验室 · 预录语音（edge-tts 生成的 mp3，gen-voice.py 产生；档名＝FNV-1a(声音|句子)，同一句话只录一次）
   声音（角色映射也写在 gen-voice.py 顶部和 handoff.md）：
     X 旁白（步骤条、原因句、性质卡题目、闯关任务句、连环关提示与总结）＝ zh-CN-XiaoxiaoNeural
     Y 实验伙伴（「分开了！」「差一点！」「没分开」「对！」「再试试！」这类短句）＝ zh-CN-YunxiNeural
     Z 大挑战开场说明＝ zh-CN-YunyangNeural（溶解赛跑的开场由 race 页自己配）
   自动播放被浏览器挡下时，显示「点一下画面，开启声音」，等第一次点击补播同一个 mp3；不退回 speechSynthesis（机械声）。
   画面右上角有静音按钮（modes.js 接）。 */
(function () {
  'use strict';
  const LAB = window.LAB;
  const VOICES = { X: 'zh-CN-XiaoxiaoNeural', Y: 'zh-CN-YunxiNeural', Z: 'zh-CN-YunyangNeural' };
  const BASE = (window.LAB_AUDIO_BASE || 'audio/');
  function clipKey(voice, text) {            // FNV-1a 32 位（UTF-8），gen-voice.py 用同一个算法
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(voice + '|' + text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  const hint = document.getElementById('soundhint');
  const V = LAB.voice = {
    on: true, audio: null, token: 0, blocked: null, spoken: [], missing: [], VOICES, clipKey,
    stop() { this.token++; if (this.audio) { try { this.audio.pause(); } catch (e) { /* 忽略 */ } this.audio = null; } },
    setOn(on) { this.on = !!on; if (!on) { this.stop(); showHint(false); } },
    /* lines：[{v:'X', t:'句子'}, ...] 依序播；done 在全部播完时调用 */
    say(lines, done) {
      this.stop();
      const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      const my = this.token;
      list.forEach((l) => this.spoken.push(l.t));
      if (!this.on) { setTimeout(() => { if (my === this.token && done) done(); }, 300); return; }
      const next = (i) => { if (my !== this.token) return; if (i >= list.length) { if (done) done(); return; } this.one(list[i], my, () => next(i + 1)); };
      next(0);
    },
    one(l, my, cb) {
      const key = clipKey(VOICES[l.v], l.t), fin = () => { if (my === this.token) cb(); };
      if (!(window.VOICE_CLIPS && window.VOICE_CLIPS[key])) { this.missing.push(l.t); setTimeout(fin, 400); return; }       // 缺档：安静带过，不用机械声
      try {
        const au = new Audio(BASE + key + '.mp3'); this.audio = au; au.onended = fin; au.onerror = () => setTimeout(fin, 200);
        const p = au.play();
        if (p && p.catch) p.catch((err) => {
          if (my !== this.token || this.audio !== au) return;
          if (err && err.name === 'NotAllowedError') this.waitGesture(au, my, fin); else fin();
        });
      } catch (e) { fin(); }
    },
    /* 浏览器挡下自动播放：等第一次点击／按键，补播同一个 mp3 */
    waitGesture(au, my, fin) {
      this.blocked = { au, my, fin }; showHint(true);
      if (this._wired) return; this._wired = true;
      const go = () => {
        window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); this._wired = false; showHint(false);
        const b = this.blocked; this.blocked = null; if (!b || b.my !== this.token || this.audio !== b.au) return;
        try { b.au.currentTime = 0; } catch (e) { /* 忽略 */ }
        const q = b.au.play(); if (q && q.catch) q.catch(() => b.fin());
      };
      window.addEventListener('pointerdown', go, true); window.addEventListener('keydown', go, true);
    },
    sayNarr(t) { this.say([{ v: 'X', t }]); },
    sayPartner(t) { this.say([{ v: 'Y', t }]); },
    sayAnn(t) { this.say([{ v: 'Z', t }]); },
    sayList(texts) { this.say(texts.map((t) => ({ v: 'X', t }))); },
    sayResult(kind, text, title) { this.say([{ v: 'Y', t: title || LAB.KIND_LABEL[kind] }, { v: 'X', t: text }]); },

    /* 全部需要预录的句子（gen-voice.py 从网页取；验收脚本用它对 audio/ 里的 mp3） */
    allLines() {
      const out = new Map();
      const add = (v, t) => { if (t) out.set(v + '|' + t, { v, voice: VOICES[v], text: t, key: clipKey(VOICES[v], t) }); };
      // 结果卡：标题（伙伴）＋原因句（旁白）
      Object.values(LAB.KIND_LABEL).forEach((t) => add('Y', t));
      add('Y', '再想想'); Object.values(LAB.CHAIN).forEach((c) => add('Y', c.doneTitle));
      Object.values(LAB.TRUTH).forEach((row) => Object.values(row).forEach(([, t]) => add('X', t)));
      // 性质卡：题目、「对！」「再试试！」
      add('X', LAB.PROP_ASK); add('Y', LAB.PHRASE.ok); add('Y', LAB.PHRASE.retry);
      // 步骤条
      (LAB.GUIDE_TEXT || []).forEach((t) => add('X', t));
      // 闯关任务句
      LAB.LEVELS.forEach((g) => g.items.forEach((it) => { if (!it.chain) add('X', LAB.levelTask(it)); }));
      // 连环关：大挑战开场（Yunyang）、提示、每步完成、总结
      Object.values(LAB.CHAIN).forEach((c) => {
        add('Z', c.intro); add('X', c.summary); (c.hints || []).forEach((t) => add('X', t)); (c.stepDone || []).forEach((t) => add('X', t));
        add('X', c.ask); add('X', c.sameLook);
      });
      add('X', '还有一杯没晒。把另一杯也试一试。');
      // 其他玩法
      (LAB.MODE_SAY || []).forEach((l) => add(l.v, l.t));
      add('X', '先选一个混合物。');
      return [...out.values()];
    },
  };
  function showHint(on) { if (hint) hint.classList.toggle('show', !!on); }
  window.__debug = window.__debug || {};
  window.__debug.voice = V;
})();
