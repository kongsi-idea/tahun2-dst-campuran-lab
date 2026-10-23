/* 溶解赛跑 · 语音：预录 mp3 优先（audio/race/<文字 hash>.mp3）。
   自动播放被浏览器挡下（NotAllowedError）时，不改用机械的 speechSynthesis：显示「点一下画面，开启声音」，等第一次点击补播同一个 mp3
   （做法抄 tahun3-mt-sukatan 的 Voice.waitGesture）。只有音档缺了／坏了才退回浏览器朗读。 */
(function () {
  'use strict';
  function clipKey(voice, text) {   // FNV-1a 32 位（UTF-8），gen-voice-race.py 用同一个算法
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(voice + '|' + text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  const PP = window.makePackPlayer ? window.makePackPlayer('audio/race/pack.mp3', window.VOICE_PACK_RACE) : null;   // 语音包（见 pack-player.js）
  const hint = () => document.getElementById('soundHint');
  const soundHint = (on) => { const el = hint(); if (el) el.classList.toggle('show', !!on); };
  const Voice = {
    on: true, audio: null, token: 0, spoken: [], missing: [], blocked: 0,
    stop() { this.token++; if (PP) PP.stop(); soundHint(false); if (this.audio) { try { this.audio.pause(); } catch (e) { } this.audio = null; } if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { } },
    say(lines, done) {
      this.stop();
      const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      const my = this.token;
      const next = (i) => { if (my !== this.token) return; if (i >= list.length) { if (done) done(); return; } this.one(list[i], my, () => next(i + 1)); };
      list.forEach((l) => this.spoken.push(l.t));
      if (!this.on) { setTimeout(() => { if (my === this.token && done) done(); }, 300); return; }
      next(0);
    },
    one(l, my, cb) {
      const key = clipKey(l.v, l.t);
      const fin = () => { if (my === this.token) cb(); };
      if (window.VOICE_CLIPS_RACE && window.VOICE_CLIPS_RACE[key]) {
        const single = () => {
          if (my !== this.token) return;
          try {
            const au = new Audio('audio/race/' + key + '.mp3'); this.audio = au; au.onended = fin;
            au.onerror = () => { if (my === this.token) this.tts(l, my, fin); };
            const p = au.play();
            if (p && p.catch) p.catch((err) => {
              if (my !== this.token || this.audio !== au) return;
              if (err && err.name === 'NotAllowedError') this.waitGesture(au, my, fin); else this.tts(l, my, fin);
            });
          } catch (e) { this.tts(l, my, fin); }
        };
        if (PP && PP.play(key, fin, single)) return;       // 语音包已载好就从包里切这一句，否则逐档播单档
        single();
        return;
      }
      this.missing.push(l.t); this.tts(l, my, fin);
    },
    waitGesture(au, my, fin) {
      this.blocked++; soundHint(true);
      const go = () => {
        window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); soundHint(false);
        if (my !== this.token || this.audio !== au) return;
        try { au.currentTime = 0; } catch (e) { }
        const q = au.play(); if (q && q.catch) q.catch(() => { if (my === this.token) fin(); });
      };
      window.addEventListener('pointerdown', go, true); window.addEventListener('keydown', go, true);
    },
    tts(l, my, cb) {     // 只有音档缺了／坏了才走这里
      if (!('speechSynthesis' in window)) { setTimeout(() => { if (my === this.token) cb(); }, 600); return; }
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(l.t.replace(/[「」]/g, '')); u.lang = 'zh-CN'; u.rate = 1;
        let done = false; const fin = () => { if (done) return; done = true; clearTimeout(wd); if (my === this.token) cb(); };
        const wd = setTimeout(fin, 900 + l.t.length * 320); u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
      } catch (e) { setTimeout(() => { if (my === this.token) cb(); }, 600); }
    },
  };
  window.RaceVoice = Voice; window.raceClipKey = clipKey;
})();
